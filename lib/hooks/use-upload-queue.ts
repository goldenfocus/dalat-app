/**
 * Unified Upload Queue Hook
 *
 * Provides queue-based file uploading with:
 * - Concurrency control (max N simultaneous uploads)
 * - Automatic image/video compression
 * - Retry logic with exponential backoff
 * - Pause/resume functionality
 * - Works for both single and bulk uploads
 */

import { useCallback, useRef, useReducer, useEffect } from "react";
import {
  validateMediaFile,
  needsConversion,
  generateVideoThumbnail,
} from "@/lib/media-utils";
import { convertIfNeeded, convertHeicOnR2 } from "@/lib/media-conversion";
import { needsImageCompression, compressImage } from "@/lib/image-compression";
import type { CompressionProgress } from "@/lib/video-compression";
import { uploadFile as uploadToStorage } from "@/lib/storage/client";
import { triggerHaptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import * as tus from "tus-js-client";

// Configuration
const MAX_CONCURRENT_UPLOADS = 3; // Don't overwhelm mobile connections
const MAX_RETRIES = 2;
const RETRY_DELAYS = [2000, 5000]; // ms

export type UploadStatus =
  | "queued"
  | "compressing"
  | "converting"
  | "uploading"
  | "uploaded"
  | "processing" // Server-side video processing (Cloudflare Stream)
  | "saving" // Saving as draft to database
  | "complete" // Saved as draft, ready to publish
  | "error";

export interface QueuedUpload {
  id: string;
  file: File;
  name: string;
  size: number;
  isVideo: boolean;
  status: UploadStatus;
  progress: number;
  error?: string;
  retryCount: number;
  previewUrl?: string;
  localThumbnailUrl?: string; // For video thumbnails
  duration?: number; // Video duration
  mediaUrl?: string; // Final uploaded URL
  // Cloudflare Stream fields
  cfVideoUid?: string;
  cfPlaybackUrl?: string;
  // Compression progress
  compressionProgress?: CompressionProgress;
  // Draft moment ID (set after auto-save)
  momentId?: string;
}

interface QueueState {
  items: QueuedUpload[];
  isPaused: boolean;
}

type QueueAction =
  | { type: "ADD_FILES"; files: QueuedUpload[] }
  | { type: "UPDATE_ITEM"; id: string; updates: Partial<QueuedUpload> }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "CLEAR_COMPLETED" }
  | { type: "RETRY_ITEM"; id: string }
  | { type: "RETRY_ALL_FAILED" };

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "ADD_FILES":
      return {
        ...state,
        items: [...state.items, ...action.files],
      };

    case "UPDATE_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, ...action.updates } : item
        ),
      };

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };

    case "SET_PAUSED":
      return { ...state, isPaused: action.paused };

    case "CLEAR_COMPLETED":
      return {
        ...state,
        items: state.items.filter((item) => item.status !== "uploaded" && item.status !== "complete"),
      };

    case "RETRY_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id
            ? { ...item, status: "queued" as const, error: undefined }
            : item
        ),
      };

    case "RETRY_ALL_FAILED":
      return {
        ...state,
        items: state.items.map((item) =>
          item.status === "error"
            ? { ...item, status: "queued" as const, error: undefined }
            : item
        ),
      };

    default:
      return state;
  }
}

interface UseUploadQueueOptions {
  eventId: string;
  userId: string;
  onUploadComplete?: (item: QueuedUpload) => void;
  maxConcurrent?: number;
}

export function useUploadQueue({
  eventId,
  userId,
  onUploadComplete,
  maxConcurrent = MAX_CONCURRENT_UPLOADS,
}: UseUploadQueueOptions) {
  const [state, dispatch] = useReducer(queueReducer, {
    items: [],
    isPaused: false,
  });

  // Use refs to track active uploads and avoid stale closures
  const activeUploadsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state; // Always keep ref up to date
  const supabaseRef = useRef(createClient());

  // Save upload as draft to database immediately after upload completes
  const saveAsDraft = useCallback(async (
    id: string,
    mediaUrl: string | null,
    thumbnailUrl: string | null,
    cfVideoUid: string | null,
    isVideo: boolean
  ): Promise<string | null> => {
    if (!mountedRef.current) return null;

    dispatch({ type: "UPDATE_ITEM", id, updates: { status: "saving" } });

    try {
      const { data: momentId, error } = await supabaseRef.current.rpc("create_moment_draft", {
        p_event_id: eventId,
        p_media_url: mediaUrl || "",
        p_media_type: isVideo ? "video" : "image",
        p_thumbnail_url: thumbnailUrl,
        // Caption will be added when user publishes
        p_text_content: null,
      });

      if (error) throw error;

      if (mountedRef.current) {
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "complete", momentId },
        });
      }

      console.log(`[UploadQueue] Saved as draft: ${momentId}`);

      // Note: Embedding is triggered after publish (batched in moment-form.tsx),
      // not during upload — drafts are filtered out by the embed endpoint.

      return momentId;
    } catch (err) {
      console.error("[UploadQueue] Failed to save draft:", err);
      if (mountedRef.current) {
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: {
            status: "error",
            error: err instanceof Error ? err.message : "Failed to save draft",
          },
        });
      }
      return null;
    }
  }, [eventId]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Process a single upload - this is called for each file
   */
  const processUpload = useCallback(async (item: QueuedUpload) => {
    const { id, file, isVideo } = item;
    let fileToUpload = file;
    let needsServerHeicConversion = false;

    // Mark as active
    activeUploadsRef.current.add(id);

    try {
      // Step 1: Convert HEIC images (skip video conversion - let Cloudflare handle it)
      if (needsConversion(file) && !isVideo) {
        dispatch({ type: "UPDATE_ITEM", id, updates: { status: "converting" } });
        const conversionResult = await convertIfNeeded(file);
        fileToUpload = conversionResult.file;
        needsServerHeicConversion = conversionResult.needsServerConversion;

        // Update preview with converted file (only if actually converted)
        if (!needsServerHeicConversion) {
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          dispatch({
            type: "UPDATE_ITEM",
            id,
            updates: { previewUrl: newPreviewUrl },
          });
        }
      }

      // Step 2: Compress images if needed (>3MB → ~2MB)
      if (!isVideo && needsImageCompression(fileToUpload)) {
        dispatch({ type: "UPDATE_ITEM", id, updates: { status: "compressing" } });
        const result = await compressImage(fileToUpload);
        if (result.wasCompressed) {
          fileToUpload = result.file;
          console.log(`[UploadQueue] Compressed ${file.name}: ${result.originalSize} → ${result.compressedSize}`);
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          dispatch({
            type: "UPDATE_ITEM",
            id,
            updates: { previewUrl: newPreviewUrl },
          });
        }
      }

      // Step 3: For VIDEOS - upload to Cloudflare Stream (server-side processing)
      if (isVideo) {
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "uploading", progress: 5 },
        });

        console.log(`[UploadQueue] Uploading video ${file.name} (${file.size} bytes) to Cloudflare Stream`);

        // Get direct upload URL from our API
        const response = await fetch("/api/moments/upload-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            filename: file.name,
            fileSizeBytes: file.size,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to get upload URL: ${response.status}`);
        }

        const { uploadUrl, videoUid } = await response.json();

        // Upload to Cloudflare Stream using proper TUS client (resumable, chunked)
        dispatch({ type: "UPDATE_ITEM", id, updates: { progress: 10 } });

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: uploadUrl,
            uploadUrl: uploadUrl,
            retryDelays: [0, 1000, 3000, 5000, 10000], // More retries for mobile
            chunkSize: 10 * 1024 * 1024, // 10MB chunks for better mobile reliability
            metadata: {
              filename: file.name,
              filetype: file.type || "video/mp4",
            },
            onError: (error) => {
              console.error("[TUS] Upload error:", error);
              reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              if (mountedRef.current) {
                const percent = Math.round((bytesUploaded / bytesTotal) * 85) + 10; // 10-95%
                dispatch({ type: "UPDATE_ITEM", id, updates: { progress: percent } });
              }
            },
            onSuccess: () => {
              console.log("[TUS] Upload complete for video:", videoUid);
              resolve();
            },
          });

          // Check for previous uploads to resume (great for flaky connections)
          upload.findPreviousUploads().then((previousUploads) => {
            if (previousUploads.length > 0) {
              console.log("[TUS] Resuming previous upload for:", file.name);
              upload.resumeFromPreviousUpload(previousUploads[0]);
            }
            upload.start();
          });
        });

        console.log(`[UploadQueue] Video uploaded to Cloudflare Stream: ${file.name} → ${videoUid}`);

        if (mountedRef.current) {
          // Update with video UID before saving as draft
          dispatch({
            type: "UPDATE_ITEM",
            id,
            updates: {
              cfVideoUid: videoUid,
              progress: 100,
            },
          });

          // Immediately save as draft to database
          await saveAsDraft(id, null, null, videoUid, true);

          triggerHaptic("light");

          if (onUploadComplete) {
            onUploadComplete({
              ...item,
              status: "complete",
              cfVideoUid: videoUid,
            });
          }
        }
      } else {
        // Step 4: For IMAGES - upload to storage
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "uploading", progress: 10, compressionProgress: undefined },
        });

        const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `${eventId}/${userId}/${Date.now()}_${id.slice(0, 8)}.${ext}`;

        console.log(`[UploadQueue] Uploading ${file.name} (${fileToUpload.size} bytes) as ${fileName}`);

        let publicUrl: string;

        // Upload to R2 via presigned URL (works for all formats including HEIC)
        const result = await uploadToStorage("moments", fileToUpload, {
          filename: fileName,
        });
        publicUrl = result.publicUrl;

        // If HEIC, convert to JPEG on R2 server-side
        // (sends only the path as JSON — avoids Cloudflare WAF blocking binary uploads)
        if (needsServerHeicConversion) {
          console.log("[UploadQueue] Converting HEIC on R2:", fileName);
          const convertResult = await convertHeicOnR2("moments", fileName);
          publicUrl = convertResult.url;
          console.log("[UploadQueue] HEIC conversion complete:", publicUrl);
        }

        console.log(`[UploadQueue] Upload complete: ${file.name} → ${publicUrl}`);

        if (mountedRef.current) {
          // Update with URL before saving as draft
          dispatch({
            type: "UPDATE_ITEM",
            id,
            updates: {
              mediaUrl: publicUrl,
              // Update preview to converted JPEG URL (original HEIC blob can't render in browsers)
              ...(needsServerHeicConversion && { previewUrl: publicUrl }),
              progress: 100,
            },
          });

          // Immediately save as draft to database
          await saveAsDraft(id, publicUrl, null, null, false);

          triggerHaptic("light");

          if (onUploadComplete) {
            onUploadComplete({ ...item, status: "complete", mediaUrl: publicUrl });
          }
        }
      }
    } catch (err) {
      console.error(`[UploadQueue] Upload error for ${file.name}:`, err);

      const errorMessage = err instanceof Error ? err.message : "Upload failed";

      // Get current retry count from the ref (avoids stale closure)
      const currentItem = stateRef.current.items.find((i) => i.id === id);
      const retryCount = currentItem?.retryCount ?? 0;

      if (retryCount < MAX_RETRIES) {
        // Schedule retry
        const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`[UploadQueue] Will retry ${file.name} in ${delay}ms (attempt ${retryCount + 1})`);

        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { retryCount: retryCount + 1, status: "queued", error: undefined },
        });

        // The retry will happen automatically when processQueue runs next
      } else {
        console.error(`[UploadQueue] Max retries exceeded for ${file.name}`);
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "error", error: errorMessage },
        });
      }
    } finally {
      // Mark as no longer active
      activeUploadsRef.current.delete(id);

      // Trigger next queue processing
      if (mountedRef.current) {
        // Use setTimeout to avoid synchronous state issues
        setTimeout(() => processQueue(), 100);
      }
    }
  }, [eventId, userId, onUploadComplete]);

  /**
   * Process the queue - start uploads for queued items up to concurrency limit
   */
  const processQueue = useCallback(() => {
    if (!mountedRef.current) return;

    const currentState = stateRef.current;
    if (currentState.isPaused) return;

    const activeCount = activeUploadsRef.current.size;
    const availableSlots = maxConcurrent - activeCount;

    if (availableSlots <= 0) return;

    // Find queued items that aren't already being processed
    const queuedItems = currentState.items.filter(
      (item) => item.status === "queued" && !activeUploadsRef.current.has(item.id)
    );

    if (queuedItems.length === 0) return;

    // Start uploads for available slots
    const itemsToStart = queuedItems.slice(0, availableSlots);
    console.log(`[UploadQueue] Starting ${itemsToStart.length} uploads (${activeCount} active, ${availableSlots} slots)`);

    for (const item of itemsToStart) {
      processUpload(item);
    }
  }, [maxConcurrent, processUpload]);

  // Process queue whenever state changes
  useEffect(() => {
    processQueue();
  }, [state.items, state.isPaused, processQueue]);

  /**
   * Add files to the upload queue
   */
  const addFiles = useCallback((files: File[]): string[] => {
    const newItems: QueuedUpload[] = [];
    const ids: string[] = [];

    for (const file of files) {
      const validationError = validateMediaFile(file);
      if (validationError) {
        console.warn(`[UploadQueue] Validation failed for ${file.name}:`, validationError);
        continue;
      }

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isVideo = file.type.startsWith("video/") || ext === "mov";
      const previewUrl = URL.createObjectURL(file);

      newItems.push({
        id,
        file,
        name: file.name,
        size: file.size,
        isVideo,
        status: "queued",
        progress: 0,
        retryCount: 0,
        previewUrl,
      });

      ids.push(id);

      // Generate video thumbnail in background
      if (isVideo) {
        generateVideoPreview(file, id);
      }
    }

    if (newItems.length > 0) {
      console.log(`[UploadQueue] Adding ${newItems.length} files to queue`);
      dispatch({ type: "ADD_FILES", files: newItems });
    }

    return ids;
  }, []);

  /**
   * Generate video thumbnail and capture duration
   */
  const generateVideoPreview = async (file: File, itemId: string) => {
    try {
      const thumbnailBlob = await generateVideoThumbnail(file);
      const localThumbnailUrl = URL.createObjectURL(thumbnailBlob);

      // Get duration
      const video = document.createElement("video");
      video.preload = "metadata";
      const videoUrl = URL.createObjectURL(file);

      const duration = await new Promise<number>((resolve) => {
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(videoUrl);
          resolve(video.duration);
        };
        video.onerror = () => {
          URL.revokeObjectURL(videoUrl);
          resolve(0);
        };
        video.src = videoUrl;
      });

      if (mountedRef.current) {
        dispatch({
          type: "UPDATE_ITEM",
          id: itemId,
          updates: { localThumbnailUrl, duration },
        });
      }
    } catch (err) {
      console.warn("[UploadQueue] Failed to generate video preview:", err);
    }
  };

  /**
   * Remove an item from the queue
   */
  const removeItem = useCallback((id: string) => {
    const item = stateRef.current.items.find((i) => i.id === id);
    if (item) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.localThumbnailUrl) URL.revokeObjectURL(item.localThumbnailUrl);
    }
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  /**
   * Retry a failed upload
   */
  const retryItem = useCallback((id: string) => {
    dispatch({ type: "RETRY_ITEM", id });
  }, []);

  /**
   * Retry all failed uploads
   */
  const retryAllFailed = useCallback(() => {
    dispatch({ type: "RETRY_ALL_FAILED" });
  }, []);

  /**
   * Pause the queue
   */
  const pause = useCallback(() => {
    dispatch({ type: "SET_PAUSED", paused: true });
  }, []);

  /**
   * Resume the queue
   */
  const resume = useCallback(() => {
    dispatch({ type: "SET_PAUSED", paused: false });
  }, []);

  /**
   * Clear completed uploads
   */
  const clearCompleted = useCallback(() => {
    // Revoke URLs for completed items (now includes "complete" status for drafts)
    stateRef.current.items
      .filter((item) => item.status === "uploaded" || item.status === "complete")
      .forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.localThumbnailUrl) URL.revokeObjectURL(item.localThumbnailUrl);
      });
    dispatch({ type: "CLEAR_COMPLETED" });
  }, []);

  /**
   * Publish all drafts for this event
   */
  const publishDrafts = useCallback(async (): Promise<{ count: number; error: string | null }> => {
    try {
      const { data, error } = await supabaseRef.current.rpc("publish_user_drafts", {
        p_event_id: eventId,
      });

      if (error) throw error;

      return { count: data as number, error: null };
    } catch (err) {
      console.error("[UploadQueue] Failed to publish drafts:", err);
      return {
        count: 0,
        error: err instanceof Error ? err.message : "Failed to publish",
      };
    }
  }, [eventId]);

  // Calculate stats
  const activeCount = activeUploadsRef.current.size;
  const stats = {
    total: state.items.length,
    queued: state.items.filter((i) => i.status === "queued").length,
    uploading: state.items.filter(
      (i) => i.status === "uploading" || i.status === "compressing" || i.status === "converting"
    ).length,
    saving: state.items.filter((i) => i.status === "saving").length, // Saving to database as draft
    processing: state.items.filter((i) => i.status === "processing").length, // Server-side video processing (legacy)
    // Completed = saved as draft and ready to publish
    completed: state.items.filter((i) => i.status === "complete" || i.status === "uploaded" || i.status === "processing").length,
    failed: state.items.filter((i) => i.status === "error").length,
    active: activeCount,
  };

  // Consider complete if all items are either complete (saved as draft) OR processing
  const isComplete = stats.completed === stats.total && stats.total > 0;
  const hasErrors = stats.failed > 0;
  const isUploading = stats.uploading > 0 || stats.queued > 0 || activeCount > 0;
  const hasProcessingVideos = stats.processing > 0;

  return {
    items: state.items,
    stats,
    isPaused: state.isPaused,
    isComplete,
    hasErrors,
    isUploading,
    hasProcessingVideos, // True if videos are being processed in the cloud
    addFiles,
    removeItem,
    retryItem,
    retryAllFailed,
    pause,
    resume,
    clearCompleted,
    publishDrafts, // Publish all saved drafts for this event
  };
}
