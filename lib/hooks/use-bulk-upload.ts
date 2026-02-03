"use client";

import { useReducer, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  validateMediaFile,
  ALLOWED_MEDIA_TYPES,
  needsConversion,
} from "@/lib/media-utils";
import { convertIfNeeded } from "@/lib/media-conversion";
import {
  needsImageCompression,
  compressImage,
} from "@/lib/image-compression";
import type {
  BulkUploadState,
  BulkUploadAction,
  FileUploadState,
  BulkUploadStats,
  FileMediaType,
  CreateMomentsBatchResponse,
  MomentBatchItem,
} from "@/lib/bulk-upload/types";

const CONCURRENCY_LIMIT = 5;
const DB_BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

function calculateStats(files: Map<string, FileUploadState>): BulkUploadStats {
  const stats: BulkUploadStats = {
    total: files.size,
    queued: 0,
    converting: 0,
    uploading: 0,
    uploaded: 0,
    saving: 0,
    complete: 0,
    failed: 0,
  };

  for (const file of files.values()) {
    switch (file.status) {
      case "queued":
        stats.queued++;
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
          momentId: null,
          error: null,
          retryCount: 0,
          caption: null,
          batchId: state.batchId,
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
          converting: 0,
          uploading: 0,
          uploaded: 0,
          saving: 0,
          complete: 0,
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
      converting: 0,
      uploading: 0,
      uploaded: 0,
      saving: 0,
      complete: 0,
      failed: 0,
    },
  });

  const activeUploadsRef = useRef(new Set<string>());
  const supabaseRef = useRef(createClient());
  const isPausedRef = useRef(false);
  const processingRef = useRef(false);

  // Process the upload queue
  const processQueue = useCallback(async () => {
    if (isPausedRef.current || processingRef.current) return;
    processingRef.current = true;

    try {
      const files = Array.from(state.files.values());
      const queued = files.filter((f) => f.status === "queued");
      const activeCount = activeUploadsRef.current.size;
      const availableSlots = CONCURRENCY_LIMIT - activeCount;

      // Start new uploads
      const toStart = queued.slice(0, availableSlots);
      for (const file of toStart) {
        uploadFile(file);
      }

      // Check if we should batch insert to DB
      const uploaded = files.filter((f) => f.status === "uploaded");
      const noMoreQueued = queued.length <= toStart.length;
      const noActiveUploads = activeCount === 0 || (activeCount - toStart.length === 0);

      if (
        uploaded.length >= DB_BATCH_SIZE ||
        (noMoreQueued && noActiveUploads && uploaded.length > 0)
      ) {
        await saveBatchToDatabase(uploaded.slice(0, DB_BATCH_SIZE));
      }
    } finally {
      processingRef.current = false;
    }
  }, [state.files, state.eventId, state.batchId]);

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

    // Convert if needed (HEIC → JPEG, MOV → MP4)
    const conversionNeeded = needsConversion(file);
    console.log("[BulkUpload] needsConversion result:", conversionNeeded);

    if (conversionNeeded) {
      console.log("[BulkUpload] Conversion needed, setting status to converting");
      dispatch({ type: "UPDATE_FILE", id, updates: { status: "converting" } });
      try {
        console.log("[BulkUpload] Calling convertIfNeeded...");
        fileToUpload = await convertIfNeeded(file);
        console.log("[BulkUpload] Conversion complete:", fileToUpload.name, fileToUpload.type, fileToUpload.size);

        // Update preview with converted file
        const newPreviewUrl = URL.createObjectURL(fileToUpload);
        dispatch({
          type: "UPDATE_FILE",
          id,
          updates: {
            previewUrl: newPreviewUrl,
            type: getFileMediaType(fileToUpload),
          },
        });
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
    dispatch({ type: "UPDATE_FILE", id, updates: { status: "uploading" } });

    try {
      // Generate unique filename (use converted file's extension)
      const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${state.eventId}/${state.userId}/${Date.now()}_${id.slice(0, 8)}.${ext}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabaseRef.current.storage
        .from("moments")
        .upload(fileName, fileToUpload, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabaseRef.current.storage.from("moments").getPublicUrl(fileName);

      dispatch({
        type: "UPDATE_FILE",
        id,
        updates: { status: "uploaded", mediaUrl: publicUrl, progress: 100 },
      });
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

  const saveBatchToDatabase = async (files: FileUploadState[]) => {
    const ids = files.map((f) => f.id);
    dispatch({ type: "MARK_FILES_SAVING", ids });

    const batchData: MomentBatchItem[] = files.map((f) => ({
      content_type: f.type,
      media_url: f.mediaUrl!,
      text_content: f.caption,
      batch_id: f.batchId,
    }));

    try {
      const { data, error } = await supabaseRef.current.rpc("create_moments_batch", {
        p_event_id: state.eventId,
        p_moments: batchData,
        p_user_id: godModeUserId || null, // Only pass when superadmin is impersonating (God Mode)
      });

      if (error) throw error;

      const response = data as CreateMomentsBatchResponse;
      dispatch({
        type: "MARK_FILES_COMPLETE",
        ids,
        momentIds: response.moment_ids,
      });

      // Fire-and-forget: Generate embeddings for visual search
      // Only for photos (video embedding not yet supported)
      const photoMomentIds = response.moment_ids.filter((_, idx) =>
        batchData[idx].content_type === "photo"
      );
      if (photoMomentIds.length > 0) {
        fetch("/api/moments/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ momentIds: photoMomentIds }),
        }).catch((err) => {
          console.warn("[BulkUpload] Embedding generation failed (non-critical):", err);
        });
      }
    } catch (err) {
      dispatch({
        type: "MARK_FILES_ERROR",
        ids,
        error: err instanceof Error ? err.message : "Failed to save to database",
      });
    }

    scheduleNextProcess();
  };

  const scheduleNextProcess = useCallback(() => {
    // Use setTimeout to avoid blocking and allow state to update
    setTimeout(() => {
      if (!isPausedRef.current && state.status === "uploading") {
        processQueue();
      }
    }, 100);
  }, [processQueue, state.status]);

  // Store processQueue in a ref to avoid triggering effect on every state change
  const processQueueRef = useRef(processQueue);
  processQueueRef.current = processQueue;

  // Start processing when status changes to uploading
  // IMPORTANT: Only depend on state.status, NOT processQueue (which changes on every file update)
  useEffect(() => {
    if (state.status === "uploading") {
      isPausedRef.current = false;
      processQueueRef.current();
    }
     
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
    startUpload: () => {
      isPausedRef.current = false;
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
  };
}
