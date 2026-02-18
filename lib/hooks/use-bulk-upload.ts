"use client";

import { useReducer, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  validateMediaFile,
  ALLOWED_MEDIA_TYPES,
  needsConversion,
  generateVideoThumbnail,
} from "@/lib/media-utils";
import { convertIfNeeded, convertHeicOnR2 } from "@/lib/media-conversion";
import {
  needsImageCompression,
  compressImage,
} from "@/lib/image-compression";
import {
  computeFileHash,
  checkDuplicateHashes,
} from "@/lib/file-hash";
import { uploadFile as uploadToStorage } from "@/lib/storage/client";
import type {
  BulkUploadState,
  BulkUploadAction,
  FileUploadState,
  BulkUploadStats,
  FileMediaType,
} from "@/lib/bulk-upload/types";

const CONCURRENCY_LIMIT = 2;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

function calculateStats(files: Map<string, FileUploadState>): BulkUploadStats {
  const stats: BulkUploadStats = {
    total: files.size,
    queued: 0,
    hashing: 0,
    converting: 0,
    uploading: 0,
    uploaded: 0,
    saving: 0,
    complete: 0,
    skipped: 0,
    failed: 0,
  };

  for (const file of files.values()) {
    switch (file.status) {
      case "queued":
        stats.queued++;
        break;
      case "hashing":
        stats.hashing++;
        break;
      case "converting":
        stats.converting++;
        break;
      case "validating":
      case "uploading":
      case "retrying":
        stats.uploading++;
        break;
      case "uploaded":
        stats.uploaded++;
        break;
      case "saving":
        stats.saving++;
        break;
      case "complete":
        stats.complete++;
        break;
      case "skipped":
        stats.skipped++;
        break;
      case "error":
        stats.failed++;
        break;
    }
  }

  return stats;
}

function getFileMediaType(file: File): FileMediaType {
  // Check type or extension for video
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("video/") || ext === "mov") {
    return "video";
  }
  return "photo";
}

function bulkUploadReducer(
  state: BulkUploadState,
  action: BulkUploadAction
): BulkUploadState {
  switch (action.type) {
    case "ADD_FILES": {
      const newFiles = new Map(state.files);
      for (const file of action.files) {
        const id = crypto.randomUUID();
        newFiles.set(id, {
          id,
          file,
          name: file.name,
          size: file.size,
          type: getFileMediaType(file),
          status: "queued",
          progress: 0,
          previewUrl: URL.createObjectURL(file),
          mediaUrl: null,
          thumbnailUrl: null,
          cfVideoUid: null,
          cfPlaybackUrl: null,
          videoStatus: null,
          momentId: null,
          error: null,
          retryCount: 0,
          caption: null,
          batchId: state.batchId,
          fileHash: null,
        });
      }
      return {
        ...state,
        files: newFiles,
        stats: calculateStats(newFiles),
      };
    }

    case "REMOVE_FILE": {
      const files = new Map(state.files);
      const file = files.get(action.id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      files.delete(action.id);
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "UPDATE_FILE": {
      const files = new Map(state.files);
      const existing = files.get(action.id);
      if (existing) {
        files.set(action.id, { ...existing, ...action.updates });
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "START_UPLOAD": {
      return {
        ...state,
        status: "uploading",
      };
    }

    case "PAUSE_UPLOAD": {
      return {
        ...state,
        status: "paused",
      };
    }

    case "RESUME_UPLOAD": {
      return {
        ...state,
        status: "uploading",
      };
    }

    case "RETRY_FILE": {
      const files = new Map(state.files);
      const file = files.get(action.id);
      if (file && file.status === "error") {
        files.set(action.id, {
          ...file,
          status: "queued",
          error: null,
          retryCount: file.retryCount + 1,
        });
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "RETRY_ALL_FAILED": {
      const files = new Map(state.files);
      for (const [id, file] of files) {
        if (file.status === "error") {
          files.set(id, {
            ...file,
            status: "queued",
            error: null,
            retryCount: file.retryCount + 1,
          });
        }
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
        status: "uploading",
      };
    }

    case "SET_CAPTION": {
      const files = new Map(state.files);
      const file = files.get(action.id);
      if (file) {
        files.set(action.id, { ...file, caption: action.caption });
      }
      return { ...state, files };
    }

    case "SET_BATCH_CAPTION": {
      const files = new Map(state.files);
      for (const id of action.ids) {
        const file = files.get(id);
        if (file) {
          files.set(id, { ...file, caption: action.caption });
        }
      }
      return { ...state, files };
    }

    case "CLEAR_COMPLETE": {
      const files = new Map(state.files);
      for (const [id, file] of files) {
        if (file.status === "complete") {
          if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl);
          }
          files.delete(id);
        }
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "MARK_FILES_SAVING": {
      const files = new Map(state.files);
      for (const id of action.ids) {
        const file = files.get(id);
        if (file) {
          files.set(id, { ...file, status: "saving" });
        }
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "MARK_FILES_COMPLETE": {
      const files = new Map(state.files);
      action.ids.forEach((id, index) => {
        const file = files.get(id);
        if (file) {
          files.set(id, {
            ...file,
            status: "complete",
            momentId: action.momentIds[index] || null,
          });
        }
      });
      const newStats = calculateStats(files);
      const allComplete = newStats.complete === newStats.total && newStats.total > 0;
      return {
        ...state,
        files,
        stats: newStats,
        status: allComplete ? "complete" : state.status,
      };
    }

    case "MARK_FILES_ERROR": {
      const files = new Map(state.files);
      for (const id of action.ids) {
        const file = files.get(id);
        if (file) {
          files.set(id, { ...file, status: "error", error: action.error });
        }
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "MARK_FILES_SKIPPED": {
      const files = new Map(state.files);
      for (const id of action.ids) {
        const file = files.get(id);
        if (file) {
          files.set(id, { ...file, status: "skipped" });
        }
      }
      return {
        ...state,
        files,
        stats: calculateStats(files),
      };
    }

    case "RESET": {
      // Cleanup all preview URLs
      for (const file of state.files.values()) {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      }
      return {
        ...state,
        batchId: crypto.randomUUID(),
        files: new Map(),
        status: "idle",
        stats: {
          total: 0,
          queued: 0,
          hashing: 0,
          converting: 0,
          uploading: 0,
          uploaded: 0,
          saving: 0,
          complete: 0,
          skipped: 0,
          failed: 0,
        },
      };
    }

    default:
      return state;
  }
}

export function useBulkUpload(eventId: string, userId: string, godModeUserId?: string) {
  const [state, dispatch] = useReducer(bulkUploadReducer, {
    batchId: crypto.randomUUID(),
    eventId,
    userId,
    files: new Map(),
    status: "idle",
    concurrency: CONCURRENCY_LIMIT,
    stats: {
      total: 0,
      queued: 0,
      hashing: 0,
      converting: 0,
      uploading: 0,
      uploaded: 0,
      saving: 0,
      complete: 0,
      skipped: 0,
      failed: 0,
    },
  });

  const activeUploadsRef = useRef(new Set<string>());
  const supabaseRef = useRef(createClient());
  const isPausedRef = useRef(false);
  const processingRef = useRef(false);

  // Refs to avoid stale closures in the async upload chain.
  // Without these, processQueue → uploadFile → scheduleNextProcess → processQueue
  // forms a closed loop where each function captures state from the same render,
  // causing the queue to stall after the first batch of CONCURRENCY_LIMIT files.
  const filesRef = useRef(state.files);
  filesRef.current = state.files;
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const uploadFileRef = useRef<(fileState: FileUploadState) => Promise<void>>(null!);

  // Process the upload queue — uses refs so it always reads latest state,
  // even when called from stale closures in async upload callbacks.
  const processQueue = useCallback(async () => {
    if (isPausedRef.current || processingRef.current) return;
    processingRef.current = true;

    try {
      const files = Array.from(filesRef.current.values());
      const queued = files.filter((f) => f.status === "queued");
      const activeCount = activeUploadsRef.current.size;
      const availableSlots = CONCURRENCY_LIMIT - activeCount;

      const toStart = queued.slice(0, availableSlots);
      for (let i = 0; i < toStart.length; i++) {
        // Stagger requests by 200ms to avoid overwhelming the server
        if (i > 0) await new Promise(r => setTimeout(r, 200));
        uploadFileRef.current(toStart[i]);
      }
    } finally {
      processingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Stable — all state accessed via refs

  // Save a single upload as a draft immediately
  const saveAsDraft = async (
    id: string,
    mediaUrl: string | null,
    thumbnailUrl: string | null,
    cfVideoUid: string | null,
    isVideo: boolean,
    caption: string | null,
    fileHash: string | null
  ) => {
    dispatch({ type: "UPDATE_FILE", id, updates: { status: "saving" } });

    try {
      const { data: momentId, error } = await supabaseRef.current.rpc("create_moment_draft", {
        p_event_id: state.eventId,
        p_media_url: mediaUrl,
        p_media_type: isVideo ? "video" : "image",
        p_thumbnail_url: thumbnailUrl,
        p_text_content: caption,
        p_cf_video_uid: cfVideoUid,
        p_file_hash: fileHash,
      });

      if (error) throw error;

      dispatch({
        type: "UPDATE_FILE",
        id,
        updates: {
          status: "complete",
          momentId,
        },
      });

      // Note: Embedding is triggered after publish (batched in moment-form.tsx),
      // not during upload — drafts are filtered out by the embed endpoint.

      return momentId;
    } catch (err) {
      console.error("[BulkUpload] Failed to save draft:", err);
      dispatch({
        type: "UPDATE_FILE",
        id,
        updates: {
          status: "error",
          error: err instanceof Error ? err.message : "Failed to save draft",
        },
      });
      return null;
    }
  };

  const uploadFile = async (fileState: FileUploadState) => {
    const { id, file } = fileState;
    activeUploadsRef.current.add(id);
    console.log("[BulkUpload] Starting upload for:", file.name, "type:", file.type, "size:", file.size);

    dispatch({ type: "UPDATE_FILE", id, updates: { status: "validating" } });

    // Validate
    const error = validateMediaFile(file);
    if (error) {
      console.log("[BulkUpload] Validation failed:", error);
      dispatch({ type: "UPDATE_FILE", id, updates: { status: "error", error } });
      activeUploadsRef.current.delete(id);
      scheduleNextProcess();
      return;
    }

    let fileToUpload = file;
    let needsServerHeicConversion = false;

    // Convert if needed (HEIC → JPEG, MOV → MP4)
    const conversionNeeded = needsConversion(file);
    console.log("[BulkUpload] needsConversion result:", conversionNeeded);

    if (conversionNeeded) {
      console.log("[BulkUpload] Conversion needed, setting status to converting");
      dispatch({ type: "UPDATE_FILE", id, updates: { status: "converting" } });
      try {
        console.log("[BulkUpload] Calling convertIfNeeded...");
        const conversionResult = await convertIfNeeded(file);
        fileToUpload = conversionResult.file;
        needsServerHeicConversion = conversionResult.needsServerConversion;
        console.log("[BulkUpload] Conversion complete:", fileToUpload.name, fileToUpload.type, fileToUpload.size, "needsServerConversion:", needsServerHeicConversion);

        // Update preview with converted file (only if actually converted)
        if (!needsServerHeicConversion) {
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          dispatch({
            type: "UPDATE_FILE",
            id,
            updates: {
              previewUrl: newPreviewUrl,
              type: getFileMediaType(fileToUpload),
            },
          });
        }
      } catch (err) {
        console.error("[BulkUpload] Conversion error:", err);
        dispatch({
          type: "UPDATE_FILE",
          id,
          updates: {
            status: "error",
            error: err instanceof Error ? err.message : "Conversion failed",
          },
        });
        activeUploadsRef.current.delete(id);
        scheduleNextProcess();
        return;
      }
    }

    // Compress large images (>3MB) before upload - critical for iOS reliability
    if (needsImageCompression(fileToUpload)) {
      console.log("[BulkUpload] Image needs compression:", fileToUpload.size);
      dispatch({ type: "UPDATE_FILE", id, updates: { status: "converting" } }); // Reuse converting status for compression

      try {
        const result = await compressImage(fileToUpload);
        if (result.wasCompressed) {
          fileToUpload = result.file;
          console.log(
            `[BulkUpload] Image compressed: ${result.originalSize} → ${result.compressedSize}`
          );
          // Update preview with compressed file
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          dispatch({
            type: "UPDATE_FILE",
            id,
            updates: { previewUrl: newPreviewUrl },
          });
        }
      } catch (err) {
        console.error("[BulkUpload] Image compression error:", err);
        // Continue with original file if compression fails
      }
    }

    console.log("[BulkUpload] Proceeding to upload:", fileToUpload.name, fileToUpload.type);
    dispatch({ type: "UPDATE_FILE", id, updates: { status: "uploading", progress: 0 } });

    try {
      const isVideo = fileState.type === "video";
      const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
      const timestamp = Date.now();

      if (isVideo) {
        // ========================================
        // VIDEO: Try Cloudflare Stream, fall back to R2
        // ========================================
        console.log("[BulkUpload] Video detected, trying Cloudflare Stream...");

        // 1. Generate client-side thumbnail for immediate display
        let thumbnailUrl: string | null = null;
        try {
          console.log("[BulkUpload] Generating video thumbnail...");
          const thumbnailBlob = await generateVideoThumbnail(fileToUpload);
          const thumbnailFileName = `${state.eventId}/${state.userId}/${timestamp}_${id.slice(0, 8)}_thumb.jpg`;

          // Upload thumbnail to R2 via presigned URL
          const thumbFile = new globalThis.File([thumbnailBlob], "thumb.jpg", { type: "image/jpeg" });
          const thumbResult = await uploadToStorage("moments", thumbFile, {
            filename: thumbnailFileName,
          });
          thumbnailUrl = thumbResult.publicUrl;
          console.log("[BulkUpload] Thumbnail uploaded:", thumbnailUrl);
        } catch (thumbErr) {
          console.warn("[BulkUpload] Thumbnail generation failed (non-critical):", thumbErr);
        }

        // Try Cloudflare Stream first
        let usedCloudflare = false;
        try {
          const uploadUrlResponse = await fetch("/api/moments/upload-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: state.eventId,
              filename: fileToUpload.name,
              fileSizeBytes: fileToUpload.size,
            }),
          });

          if (uploadUrlResponse.ok) {
            const { uploadUrl, videoUid } = await uploadUrlResponse.json();
            console.log("[BulkUpload] Got Cloudflare upload URL, videoUid:", videoUid);

            // Upload video to Cloudflare via TUS protocol
            const tus = await import("tus-js-client");

            await new Promise<void>((resolve, reject) => {
              const upload = new tus.Upload(fileToUpload, {
                // Only uploadUrl — Cloudflare direct_upload URL is pre-created,
                // setting endpoint would cause POST fallback → 400 "Decoding Error"
                uploadUrl: uploadUrl,
                retryDelays: [0, 1000, 3000, 5000, 10000],
                chunkSize: 10 * 1024 * 1024, // 10MB chunks for reliability
                metadata: {
                  filename: fileToUpload.name,
                  filetype: fileToUpload.type,
                },
                onError: (error) => {
                  console.error("[BulkUpload] TUS upload error:", error);
                  reject(new Error(error.message || "Video upload failed"));
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                  const progress = Math.round((bytesUploaded / bytesTotal) * 100);
                  dispatch({
                    type: "UPDATE_FILE",
                    id,
                    updates: { progress },
                  });
                },
                onSuccess: () => {
                  console.log("[BulkUpload] Video uploaded to Cloudflare Stream");
                  resolve();
                },
              });
              upload.start();
            });

            // Update state with Cloudflare metadata
            dispatch({
              type: "UPDATE_FILE",
              id,
              updates: {
                mediaUrl: null,
                thumbnailUrl,
                cfVideoUid: videoUid,
                videoStatus: "uploading",
                progress: 100,
              },
            });

            // Immediately save as draft
            await saveAsDraft(id, null, thumbnailUrl, videoUid, true, fileState.caption, fileState.fileHash);
            usedCloudflare = true;
          } else {
            const errorData = await uploadUrlResponse.json();
            console.warn("[BulkUpload] Cloudflare Stream unavailable:", errorData.error);
          }
        } catch (cfError) {
          console.warn("[BulkUpload] Cloudflare Stream failed, falling back to R2:", cfError);
        }

        // Fallback to R2 storage if Cloudflare failed
        if (!usedCloudflare) {
          console.log("[BulkUpload] Using R2 storage fallback for video...");
          const fileName = `${state.eventId}/${state.userId}/${timestamp}_${id.slice(0, 8)}.${ext}`;

          const { publicUrl } = await uploadToStorage("moments", fileToUpload, {
            filename: fileName,
          });

          dispatch({
            type: "UPDATE_FILE",
            id,
            updates: {
              mediaUrl: publicUrl,
              thumbnailUrl,
              videoStatus: "ready", // R2 videos are ready immediately
              progress: 100,
            },
          });

          // Immediately save as draft
          await saveAsDraft(id, publicUrl, thumbnailUrl, null, true, fileState.caption, fileState.fileHash);
        }
      } else {
        // ========================================
        // PHOTO: Upload to R2/Supabase Storage
        // ========================================
        const fileName = `${state.eventId}/${state.userId}/${timestamp}_${id.slice(0, 8)}.${ext}`;

        let publicUrl: string;

        // Upload to R2 via presigned URL (works for all formats including HEIC)
        const result = await uploadToStorage("moments", fileToUpload, {
          filename: fileName,
        });
        publicUrl = result.publicUrl;

        // If HEIC, convert to JPEG server-side (reads from R2, converts, saves JPEG, deletes HEIC)
        // This avoids sending binary files through Cloudflare WAF (which returns 403)
        if (needsServerHeicConversion) {
          console.log("[BulkUpload] Converting HEIC on R2:", fileName);
          dispatch({ type: "UPDATE_FILE", id, updates: { progress: 80 } });

          const convertResult = await convertHeicOnR2("moments", fileName);
          publicUrl = convertResult.url;
          console.log("[BulkUpload] HEIC conversion complete:", publicUrl);
        }

        dispatch({
          type: "UPDATE_FILE",
          id,
          updates: {
            mediaUrl: publicUrl,
            // Update preview to converted JPEG URL (original HEIC blob can't render in browsers)
            ...(needsServerHeicConversion && { previewUrl: publicUrl }),
            progress: 100,
          },
        });

        // Immediately save as draft
        await saveAsDraft(id, publicUrl, null, null, false, fileState.caption, fileState.fileHash);
      }
    } catch (err) {
      const retryCount = fileState.retryCount;
      if (retryCount < MAX_RETRIES) {
        // Schedule retry with backoff
        const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        dispatch({
          type: "UPDATE_FILE",
          id,
          updates: { status: "retrying", retryCount: retryCount + 1 },
        });
        setTimeout(() => {
          dispatch({
            type: "UPDATE_FILE",
            id,
            updates: { status: "queued" },
          });
          scheduleNextProcess();
        }, delay);
      } else {
        dispatch({
          type: "UPDATE_FILE",
          id,
          updates: {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          },
        });
      }
    } finally {
      activeUploadsRef.current.delete(id);
      scheduleNextProcess();
    }
  };

  // Keep uploadFileRef pointing to the latest uploadFile each render
  uploadFileRef.current = uploadFile;

  const scheduleNextProcess = useCallback(() => {
    setTimeout(() => {
      if (!isPausedRef.current && statusRef.current === "uploading") {
        processQueue();
      }
    }, 100);
  }, [processQueue]); // Stable — processQueue is stable, status read from ref

  // Start processing when status changes to uploading
  useEffect(() => {
    if (state.status === "uploading") {
      isPausedRef.current = false;
      processQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Watchdog: detect stalled queue and restart processing.
  // The queue can stall when scheduleNextProcess fires before the reducer
  // updates filesRef, causing processQueue to see no queued files.
  useEffect(() => {
    if (state.status !== "uploading") return;

    const watchdog = setInterval(() => {
      if (isPausedRef.current) return;
      const files = Array.from(filesRef.current.values());
      const hasQueued = files.some((f) => f.status === "queued");
      const activeCount = activeUploadsRef.current.size;
      const isProcessing = processingRef.current;

      if (hasQueued && activeCount === 0 && !isProcessing) {
        console.warn("[BulkUpload] Watchdog: queue stalled, restarting...");
        processQueue();
      }
    }, 2000);

    return () => clearInterval(watchdog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const file of state.files.values()) {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      }
    };
  }, []);

  return {
    state,
    addFiles: (files: File[]) => {
      // Filter to only allowed types (including convertible formats)
      const allAllowedTypes = [
        ...ALLOWED_MEDIA_TYPES.image,
        ...ALLOWED_MEDIA_TYPES.gif,
        ...ALLOWED_MEDIA_TYPES.video,
        ...ALLOWED_MEDIA_TYPES.convertible.image,
        ...ALLOWED_MEDIA_TYPES.convertible.video,
      ];
      const validFiles = files.filter((f) => {
        // Check MIME type
        if (allAllowedTypes.includes(f.type as never)) return true;
        // Also check extension as fallback
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext === "heic" || ext === "heif" || ext === "mov";
      });
      if (validFiles.length > 0) {
        dispatch({ type: "ADD_FILES", files: validFiles });
      }
    },
    removeFile: (id: string) => dispatch({ type: "REMOVE_FILE", id }),
    startUpload: async () => {
      isPausedRef.current = false;

      // Step 1: Hash all queued files and check for duplicates
      const queuedFiles = Array.from(state.files.values()).filter(
        (f) => f.status === "queued"
      );

      if (queuedFiles.length === 0) {
        dispatch({ type: "START_UPLOAD" });
        return;
      }

      console.log("[BulkUpload] Hashing", queuedFiles.length, "files for duplicate detection");

      // Mark files as hashing
      for (const file of queuedFiles) {
        dispatch({
          type: "UPDATE_FILE",
          id: file.id,
          updates: { status: "hashing" },
        });
      }

      try {
        // Compute hashes for all queued files
        const hashPromises = queuedFiles.map(async (fileState) => {
          const hash = await computeFileHash(fileState.file);
          dispatch({
            type: "UPDATE_FILE",
            id: fileState.id,
            updates: { fileHash: hash, status: "queued" },
          });
          return { id: fileState.id, hash };
        });

        const hashResults = await Promise.all(hashPromises);
        const allHashes = hashResults.map((r) => r.hash);

        // Check which hashes already exist in this album
        const duplicateHashes = await checkDuplicateHashes(eventId, allHashes);
        console.log("[BulkUpload] Found", duplicateHashes.size, "duplicates");

        // Mark duplicates as skipped
        if (duplicateHashes.size > 0) {
          const duplicateIds = hashResults
            .filter((r) => duplicateHashes.has(r.hash))
            .map((r) => r.id);

          if (duplicateIds.length > 0) {
            dispatch({ type: "MARK_FILES_SKIPPED", ids: duplicateIds });
          }
        }
      } catch (err) {
        console.error("[BulkUpload] Duplicate detection failed, proceeding anyway:", err);
        // Reset all hashing files back to queued
        for (const file of queuedFiles) {
          dispatch({
            type: "UPDATE_FILE",
            id: file.id,
            updates: { status: "queued" },
          });
        }
      }

      // Step 2: Start the upload
      dispatch({ type: "START_UPLOAD" });
    },
    pauseUpload: () => {
      isPausedRef.current = true;
      dispatch({ type: "PAUSE_UPLOAD" });
    },
    resumeUpload: () => {
      isPausedRef.current = false;
      dispatch({ type: "RESUME_UPLOAD" });
    },
    retryFile: (id: string) => {
      dispatch({ type: "RETRY_FILE", id });
      if (state.status === "uploading") {
        scheduleNextProcess();
      }
    },
    retryAllFailed: () => {
      dispatch({ type: "RETRY_ALL_FAILED" });
    },
    setCaption: (id: string, caption: string) =>
      dispatch({ type: "SET_CAPTION", id, caption }),
    setBatchCaption: (ids: string[], caption: string) =>
      dispatch({ type: "SET_BATCH_CAPTION", ids, caption }),
    clearComplete: () => dispatch({ type: "CLEAR_COMPLETE" }),
    reset: () => dispatch({ type: "RESET" }),
    // Publish all drafts for this event (call this on "Publish" button)
    publishDrafts: async (): Promise<{ count: number; error: string | null }> => {
      try {
        const { data, error } = await supabaseRef.current.rpc("publish_user_drafts", {
          p_event_id: state.eventId,
        });

        if (error) throw error;

        return { count: data as number, error: null };
      } catch (err) {
        console.error("[BulkUpload] Failed to publish drafts:", err);
        return {
          count: 0,
          error: err instanceof Error ? err.message : "Failed to publish",
        };
      }
    },
  };
}
