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
import { createClient } from "@/lib/supabase/client";
import {
  validateMediaFile,
  needsConversion,
  generateVideoThumbnail,
} from "@/lib/media-utils";
import { convertIfNeeded } from "@/lib/media-conversion";
import { needsImageCompression, compressImage } from "@/lib/image-compression";
import {
  needsCompression as needsVideoCompression,
  compressVideo,
  type CompressionProgress,
} from "@/lib/video-compression";
import { uploadFile as uploadToStorage } from "@/lib/storage/client";
import { triggerHaptic } from "@/lib/haptics";

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
}

interface QueueState {
  items: QueuedUpload[];
  isPaused: boolean;
  activeCount: number;
}

type QueueAction =
  | { type: "ADD_FILES"; files: QueuedUpload[] }
  | { type: "UPDATE_ITEM"; id: string; updates: Partial<QueuedUpload> }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "INCREMENT_ACTIVE" }
  | { type: "DECREMENT_ACTIVE" }
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

    case "INCREMENT_ACTIVE":
      return { ...state, activeCount: state.activeCount + 1 };

    case "DECREMENT_ACTIVE":
      return { ...state, activeCount: Math.max(0, state.activeCount - 1) };

    case "CLEAR_COMPLETED":
      return {
        ...state,
        items: state.items.filter((item) => item.status !== "uploaded"),
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
    activeCount: 0,
  });

  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Revoke all preview URLs
      state.items.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.localThumbnailUrl) URL.revokeObjectURL(item.localThumbnailUrl);
      });
    };
  }, []);

  // Process queue when items change or state changes
  useEffect(() => {
    processQueue();
  }, [state.items, state.isPaused, state.activeCount]);

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
   * Process the queue - start uploads for queued items up to concurrency limit
   */
  const processQueue = useCallback(() => {
    if (processingRef.current || state.isPaused) return;

    const queuedItems = state.items.filter((item) => item.status === "queued");
    const availableSlots = maxConcurrent - state.activeCount;

    if (queuedItems.length === 0 || availableSlots <= 0) return;

    processingRef.current = true;

    // Start uploads for available slots
    const itemsToStart = queuedItems.slice(0, availableSlots);
    for (const item of itemsToStart) {
      dispatch({ type: "INCREMENT_ACTIVE" });
      processUpload(item);
    }

    processingRef.current = false;
  }, [state.items, state.isPaused, state.activeCount, maxConcurrent]);

  /**
   * Process a single upload
   */
  const processUpload = async (item: QueuedUpload) => {
    const { id, file } = item;
    let fileToUpload = file;

    try {
      // Step 1: Convert if needed (HEIC → JPEG, MOV → MP4)
      if (needsConversion(file)) {
        dispatch({ type: "UPDATE_ITEM", id, updates: { status: "converting" } });
        fileToUpload = await convertIfNeeded(file);

        // Update preview with converted file
        const newPreviewUrl = URL.createObjectURL(fileToUpload);
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { previewUrl: newPreviewUrl },
        });
      }

      // Step 2: Compress images if needed
      if (needsImageCompression(fileToUpload)) {
        dispatch({ type: "UPDATE_ITEM", id, updates: { status: "compressing" } });
        const result = await compressImage(fileToUpload);
        if (result.wasCompressed) {
          fileToUpload = result.file;
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          dispatch({
            type: "UPDATE_ITEM",
            id,
            updates: { previewUrl: newPreviewUrl },
          });
        }
      }

      // Step 3: Compress videos if needed
      if (needsVideoCompression(fileToUpload)) {
        dispatch({ type: "UPDATE_ITEM", id, updates: { status: "compressing" } });
        fileToUpload = await compressVideo(fileToUpload, (progress) => {
          if (mountedRef.current) {
            dispatch({
              type: "UPDATE_ITEM",
              id,
              updates: { compressionProgress: progress },
            });
          }
        });
      }

      // Step 4: Upload
      dispatch({
        type: "UPDATE_ITEM",
        id,
        updates: { status: "uploading", progress: 0, compressionProgress: undefined },
      });

      const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${userId}/${Date.now()}_${id.slice(0, 8)}.${ext}`;

      const { publicUrl } = await uploadToStorage("moments", fileToUpload, {
        filename: fileName,
      });

      if (mountedRef.current) {
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "uploaded", mediaUrl: publicUrl, progress: 100 },
        });

        triggerHaptic("light");

        // Get the updated item for callback
        const uploadedItem = state.items.find((i) => i.id === id);
        if (uploadedItem && onUploadComplete) {
          onUploadComplete({ ...uploadedItem, status: "uploaded", mediaUrl: publicUrl });
        }
      }
    } catch (err) {
      console.error("[UploadQueue] Upload error:", err);

      const errorMessage =
        err instanceof Error ? err.message : "Upload failed";

      // Check if we should retry
      const currentItem = state.items.find((i) => i.id === id);
      const retryCount = currentItem?.retryCount ?? 0;

      if (retryCount < MAX_RETRIES) {
        // Schedule retry
        const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { retryCount: retryCount + 1 },
        });

        setTimeout(() => {
          if (mountedRef.current) {
            dispatch({ type: "RETRY_ITEM", id });
          }
        }, delay);
      } else {
        dispatch({
          type: "UPDATE_ITEM",
          id,
          updates: { status: "error", error: errorMessage },
        });
      }
    } finally {
      if (mountedRef.current) {
        dispatch({ type: "DECREMENT_ACTIVE" });
      }
    }
  };

  /**
   * Remove an item from the queue
   */
  const removeItem = useCallback((id: string) => {
    const item = state.items.find((i) => i.id === id);
    if (item) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.localThumbnailUrl) URL.revokeObjectURL(item.localThumbnailUrl);
    }
    dispatch({ type: "REMOVE_ITEM", id });
  }, [state.items]);

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
    // Revoke URLs for completed items
    state.items
      .filter((item) => item.status === "uploaded")
      .forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.localThumbnailUrl) URL.revokeObjectURL(item.localThumbnailUrl);
      });
    dispatch({ type: "CLEAR_COMPLETED" });
  }, [state.items]);

  // Calculate stats
  const stats = {
    total: state.items.length,
    queued: state.items.filter((i) => i.status === "queued").length,
    uploading: state.items.filter(
      (i) => i.status === "uploading" || i.status === "compressing" || i.status === "converting"
    ).length,
    completed: state.items.filter((i) => i.status === "uploaded").length,
    failed: state.items.filter((i) => i.status === "error").length,
  };

  const isComplete = stats.completed === stats.total && stats.total > 0;
  const hasErrors = stats.failed > 0;
  const isUploading = stats.uploading > 0 || stats.queued > 0;

  return {
    items: state.items,
    stats,
    isPaused: state.isPaused,
    isComplete,
    hasErrors,
    isUploading,
    addFiles,
    removeItem,
    retryItem,
    retryAllFailed,
    pause,
    resume,
    clearCompleted,
  };
}
