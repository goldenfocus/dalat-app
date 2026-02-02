"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Camera,
  X,
  Loader2,
  Send,
  Plus,
  AlertCircle,
  RefreshCw,
  Play,
  Youtube,
  FileText,
  Music,
  File,
  Link as LinkIcon,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { cn } from "@/lib/utils";
import {
  validateMediaFile,
  ALL_ALLOWED_TYPES,
  needsConversion,
  generateVideoThumbnail,
} from "@/lib/media-utils";
import { convertIfNeeded } from "@/lib/media-conversion";
import {
  needsCompression,
  compressVideo,
  type CompressionProgress,
} from "@/lib/video-compression";
import { triggerHaptic } from "@/lib/haptics";
import { uploadFile as uploadToStorage } from "@/lib/storage/client";
import { triggerTranslation } from "@/lib/translations-client";
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  formatFileSize,
  CONTENT_TYPE_ICONS,
} from "@/components/shared/material-renderers";
import {
  extractAudioMetadata,
  albumArtToBlob,
  albumArtToDataUrl,
  isAudioFile,
  formatDuration as formatAudioDuration,
} from "@/lib/audio-metadata";
import * as tus from "tus-js-client";
import type { MomentContentType } from "@/lib/types";

// Input mode for the form
type InputMode = "media" | "youtube" | "file" | "text";

// File type mapping for materials
const FILE_TYPE_MAP: Record<string, MomentContentType> = {
  // Audio
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/x-m4a": "audio",
  // Images (material type, not photo)
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  // Documents
  "application/pdf": "pdf",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
};

const MATERIAL_ALLOWED_MIME_TYPES = Object.keys(FILE_TYPE_MAP);
const MAX_MATERIAL_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Format duration in seconds to MM:SS or H:MM:SS
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface MomentFormProps {
  eventId: string;
  eventSlug: string;
  userId: string;
  onSuccess?: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  status: "converting" | "compressing" | "uploading" | "uploaded" | "processing" | "error";
  mediaUrl?: string;
  thumbnailUrl?: string; // For video thumbnails (server-side)
  localThumbnailUrl?: string; // For video preview (client-side)
  duration?: number; // Video duration in seconds
  compressionProgress?: CompressionProgress; // For large video compression
  uploadProgress?: number; // 0-100 for TUS upload progress
  error?: string;
  caption?: string; // Individual caption for this upload
  // Cloudflare Stream fields (for video adaptive streaming)
  cfVideoUid?: string;
  cfPlaybackUrl?: string;
}

// Material upload for PDF, audio, documents
interface MaterialUpload {
  id: string;
  file: File;
  contentType: MomentContentType;
  status: "uploading" | "uploaded" | "error";
  fileUrl?: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  error?: string;
  caption?: string;
  // Audio metadata
  title?: string;
  artist?: string;
  album?: string;
  audioDurationSeconds?: number;
  audioThumbnailUrl?: string;
  audioThumbnailBlob?: Blob;
  trackNumber?: string;
  releaseYear?: number;
  genre?: string;
}

// YouTube link preview
interface YouTubePreview {
  url: string;
  videoId: string;
  thumbnailUrl: string;
}

export function MomentForm({ eventId, eventSlug, userId, onSuccess }: MomentFormProps) {
  const t = useTranslations("moments");
  const locale = useLocale();
  const router = useRouter();

  // Input mode state
  const [inputMode, setInputMode] = useState<InputMode>("media");

  // Photo/Video uploads (existing)
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // YouTube link state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubePreview, setYoutubePreview] = useState<YouTubePreview | null>(null);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Material uploads (PDF, audio, documents)
  const [materialUploads, setMaterialUploads] = useState<MaterialUpload[]>([]);

  // Shared state
  const [caption, setCaption] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materialFileInputRef = useRef<HTMLInputElement>(null);

  // Generate local video thumbnail and capture duration for preview
  const generateLocalVideoPreview = useCallback(async (file: File, itemId: string) => {
    try {
      // Generate thumbnail
      const thumbnailBlob = await generateVideoThumbnail(file);
      const localThumbnailUrl = URL.createObjectURL(thumbnailBlob);

      // Capture duration
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

      setUploads(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, localThumbnailUrl, duration }
          : item
      ));
    } catch (err) {
      console.warn("Failed to generate local video preview:", err);
    }
  }, []);

  // Upload video to Cloudflare Stream using TUS (resumable upload)
  const uploadVideoToCloudflare = async (
    file: File,
    itemId: string,
    onProgress: (progress: number) => void
  ): Promise<{ videoUid: string } | null> => {
    try {
      // Get upload URL from our API
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
        throw new Error(errorData.error || "Failed to get upload URL");
      }

      const { uploadUrl, videoUid } = await response.json();

      // Upload using TUS (resumable upload)
      return new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: uploadUrl,
          uploadUrl: uploadUrl, // Direct upload URL from Cloudflare
          retryDelays: [0, 1000, 3000, 5000], // Retry delays for flaky connections
          chunkSize: 50 * 1024 * 1024, // 50MB chunks for better resume on slow connections
          metadata: {
            filename: file.name,
            filetype: file.type,
          },
          onError: (error) => {
            console.error("[TUS] Upload error:", error);
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            onProgress(percentage);
          },
          onSuccess: () => {
            console.log("[TUS] Upload complete for video:", videoUid);
            resolve({ videoUid });
          },
        });

        // Check for previous uploads to resume
        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0) {
            console.log("[TUS] Resuming previous upload");
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload.start();
        });
      });
    } catch (error) {
      console.error("[Cloudflare] Video upload error:", error);
      // Re-throw with better message so caller can capture it
      throw error instanceof Error ? error : new Error("Video upload failed");
    }
  };

  const uploadFile = async (file: File, itemId: string) => {
    console.log("[Upload] Starting upload for:", file.name, "type:", file.type, "size:", file.size);

    try {
      let fileToUpload = file;

      // Convert if needed (HEIC → JPEG, MOV → MP4)
      const conversionNeeded = needsConversion(file);
      console.log("[Upload] needsConversion result:", conversionNeeded);

      if (conversionNeeded) {
        console.log("[Upload] Conversion needed, setting status to converting");
        setUploads(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: "converting" as const }
            : item
        ));

        try {
          console.log("[Upload] Calling convertIfNeeded...");
          fileToUpload = await convertIfNeeded(file);
          console.log("[Upload] Conversion complete:", fileToUpload.name, fileToUpload.type, fileToUpload.size);

          // Update preview with converted file
          const newPreviewUrl = URL.createObjectURL(fileToUpload);
          setUploads(prev => prev.map(item => {
            if (item.id === itemId) {
              URL.revokeObjectURL(item.previewUrl);
              return {
                ...item,
                previewUrl: newPreviewUrl,
                isVideo: fileToUpload.type.startsWith("video/"),
                status: "uploading" as const,
              };
            }
            return item;
          }));
        } catch (err) {
          console.error("[Upload] Conversion error:", err);
          setUploads(prev => prev.map(item =>
            item.id === itemId
              ? { ...item, status: "error" as const, error: err instanceof Error ? err.message : "Conversion failed" }
              : item
          ));
          return;
        }
      }

      // Compress large videos (>50MB) before upload
      if (needsCompression(fileToUpload)) {
        console.log("[Upload] Video needs compression:", fileToUpload.size);
        setUploads(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: "compressing" as const }
            : item
        ));

        try {
          fileToUpload = await compressVideo(fileToUpload, (progress) => {
            setUploads(prev => prev.map(item =>
              item.id === itemId
                ? { ...item, compressionProgress: progress }
                : item
            ));
          });
          console.log("[Upload] Compression complete:", fileToUpload.size);
        } catch (err) {
          console.error("[Upload] Compression error:", err);
          // Continue with original file if compression fails
        }
      }

      console.log("[Upload] Proceeding to upload:", fileToUpload.name, fileToUpload.type);
      setUploads(prev => prev.map(item =>
        item.id === itemId && item.status !== "error"
          ? { ...item, status: "uploading" as const, compressionProgress: undefined, uploadProgress: 0 }
          : item
      ));

      // Check MIME type AND extension (iOS Safari often sends MOV with wrong MIME)
      const videoExt = fileToUpload.name.split(".").pop()?.toLowerCase();
      const isVideoFile = fileToUpload.type.startsWith("video/") || videoExt === "mov";

      // Route videos to Cloudflare Stream for adaptive bitrate streaming
      if (isVideoFile) {
        const result = await uploadVideoToCloudflare(
          fileToUpload,
          itemId,
          (progress) => {
            setUploads(prev => prev.map(item =>
              item.id === itemId
                ? { ...item, uploadProgress: progress }
                : item
            ));
          }
        );

        if (!result) {
          throw new Error("Video upload failed - no result returned");
        }

        // Video uploaded to Cloudflare Stream - it's now "processing" (encoding)
        // The webhook will update the moment when encoding is complete
        setUploads(prev => prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: "uploaded" as const,
                cfVideoUid: result.videoUid,
                // Note: playback URL will be set by webhook when encoding completes
                uploadProgress: 100,
              }
            : item
        ));
        triggerHaptic("light");
        return;
      }

      // For images, use R2 storage via abstraction layer
      const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Upload media to R2 (or Supabase fallback if R2 not configured)
      const { publicUrl } = await uploadToStorage("moments", fileToUpload, {
        filename: fileName,
      });

      setUploads(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, status: "uploaded" as const, mediaUrl: publicUrl }
          : item
      ));
      triggerHaptic("light");
    } catch (err) {
      console.error("Upload error:", err);
      const errorMessage = err instanceof Error ? err.message : t("errors.uploadFailed");
      setUploads(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, status: "error" as const, error: errorMessage }
          : item
      ));
    }
  };

  const addFiles = (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);

    const newUploads: UploadItem[] = [];

    for (const file of fileArray) {
      const validationError = validateMediaFile(file);
      if (validationError) {
        setError(validationError);
        continue;
      }

      const itemId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isVideo = file.type.startsWith("video/") || ext === "mov";

      newUploads.push({
        id: itemId,
        file,
        previewUrl,
        isVideo,
        status: "uploading",
      });
    }

    if (newUploads.length === 0) return;

    setUploads(prev => [...prev, ...newUploads]);

    // Start uploading each file and generate video previews
    for (const item of newUploads) {
      uploadFile(item.file, item.id);
      // Generate local thumbnail + duration for videos immediately
      if (item.isVideo) {
        generateLocalVideoPreview(item.file, item.id);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemoveUpload = (itemId: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === itemId);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.localThumbnailUrl) {
          URL.revokeObjectURL(item.localThumbnailUrl);
        }
      }
      return prev.filter(u => u.id !== itemId);
    });
  };

  const handleCaptionChange = (itemId: string, newCaption: string) => {
    setUploads(prev => prev.map(item =>
      item.id === itemId ? { ...item, caption: newCaption } : item
    ));
  };

  const handleMaterialCaptionChange = (itemId: string, newCaption: string) => {
    setMaterialUploads(prev => prev.map(item =>
      item.id === itemId ? { ...item, caption: newCaption } : item
    ));
  };

  // YouTube URL validation and preview
  const handleYoutubeUrlChange = (url: string) => {
    setYoutubeUrl(url);
    setYoutubeError(null);

    if (!url.trim()) {
      setYoutubePreview(null);
      return;
    }

    const videoId = extractYouTubeId(url);
    if (videoId) {
      setYoutubePreview({
        url,
        videoId,
        thumbnailUrl: getYouTubeThumbnail(videoId, "high"),
      });
    } else {
      setYoutubePreview(null);
      if (url.length > 10) {
        setYoutubeError(t("errors.invalidYoutubeUrl"));
      }
    }
  };

  const clearYoutubePreview = () => {
    setYoutubeUrl("");
    setYoutubePreview(null);
    setYoutubeError(null);
  };

  // Material file upload (PDF, audio, documents) - uses R2 via storage abstraction
  const uploadMaterialFile = async (file: File, itemId: string) => {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const fileName = `${eventId}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { publicUrl } = await uploadToStorage("moment-materials", file, {
        filename: fileName,
      });

      // If audio file has album art, upload it too
      const item = materialUploads.find(m => m.id === itemId);
      let audioThumbnailUrl: string | undefined;
      if (item?.audioThumbnailBlob) {
        try {
          const thumbExt = item.audioThumbnailBlob.type.split("/")[1] || "jpg";
          const thumbFileName = `${eventId}/${userId}/thumb-${Date.now()}.${thumbExt}`;
          const thumbFile = new globalThis.File([item.audioThumbnailBlob], `thumb.${thumbExt}`, {
            type: item.audioThumbnailBlob.type,
          });

          const { publicUrl: thumbUrl } = await uploadToStorage("moment-materials", thumbFile, {
            filename: thumbFileName,
          });
          audioThumbnailUrl = thumbUrl;
        } catch (err) {
          console.error("Failed to upload album art:", err);
        }
      }

      setMaterialUploads(prev => prev.map(m =>
        m.id === itemId
          ? { ...m, status: "uploaded" as const, fileUrl: publicUrl, audioThumbnailUrl: audioThumbnailUrl || m.audioThumbnailUrl }
          : m
      ));
      triggerHaptic("light");
    } catch (err) {
      console.error("Material upload error:", err);
      setMaterialUploads(prev => prev.map(m =>
        m.id === itemId
          ? { ...m, status: "error" as const, error: t("errors.uploadFailed") }
          : m
      ));
    }
  };

  const addMaterialFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    for (const file of Array.from(files)) {
      // Validate file type
      if (!MATERIAL_ALLOWED_MIME_TYPES.includes(file.type)) {
        setError(t("errors.unsupportedFileType"));
        continue;
      }

      // Validate file size
      if (file.size > MAX_MATERIAL_FILE_SIZE) {
        setError(t("errors.fileSizeLimit"));
        continue;
      }

      const contentType = FILE_TYPE_MAP[file.type] || "document";
      const itemId = `material-${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Extract audio metadata if it's an audio file
      let audioMetadata: Partial<MaterialUpload> = {};
      if (isAudioFile(file)) {
        try {
          const metadata = await extractAudioMetadata(file);
          audioMetadata = {
            title: metadata.title || undefined,
            artist: metadata.artist || undefined,
            album: metadata.album || undefined,
            audioDurationSeconds: metadata.durationSeconds || undefined,
            trackNumber: metadata.trackNumber || undefined,
            releaseYear: metadata.releaseYear || undefined,
            genre: metadata.genre || undefined,
            audioThumbnailUrl: albumArtToDataUrl(metadata.albumArt) || undefined,
            audioThumbnailBlob: albumArtToBlob(metadata.albumArt) || undefined,
          };
        } catch (err) {
          console.error("Failed to extract audio metadata:", err);
        }
      }

      const newMaterial: MaterialUpload = {
        id: itemId,
        file,
        contentType,
        status: "uploading",
        originalFilename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        ...audioMetadata,
      };

      setMaterialUploads(prev => [...prev, newMaterial]);
      uploadMaterialFile(file, itemId);
    }
  };

  const handleMaterialFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addMaterialFiles(e.target.files);
    e.target.value = "";
  };

  const handleRemoveMaterial = (itemId: string) => {
    setMaterialUploads(prev => prev.filter(m => m.id !== itemId));
  };

  const handlePost = async () => {
    setIsPosting(true);
    setError(null);

    try {
      const supabase = createClient();

      // Handle based on input mode
      if (inputMode === "youtube" && youtubePreview) {
        // Post YouTube moment
        const textContent = caption.trim() || null;

        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: "youtube",
          p_media_url: null,
          p_text_content: textContent,
          p_user_id: userId,
          p_source_locale: locale,
          p_thumbnail_url: null,
          p_cf_video_uid: null,
          p_cf_playback_url: null,
          p_video_status: null,
          // YouTube fields
          p_youtube_url: youtubePreview.url,
          p_youtube_video_id: youtubePreview.videoId,
        });

        if (postError) {
          console.error("create_moment RPC error:", postError.message, postError);
          if (postError.message.includes("not_allowed_to_post")) {
            setError(t("errors.notAllowed"));
            return;
          }
          throw postError;
        }

        if (data?.moment_id && textContent) {
          triggerTranslation("moment", data.moment_id, [
            { field_name: "text_content", text: textContent },
          ]);
        }

        triggerHaptic("medium");
        clearYoutubePreview();
        setCaption("");

        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/events/${eventSlug}/moments`);
          router.refresh();
        }
        return;
      }

      if (inputMode === "file") {
        // Post material moments (PDF, audio, documents)
        const readyMaterials = materialUploads.filter(m => m.status === "uploaded" && m.fileUrl);

        for (const material of readyMaterials) {
          const textContent = (material.caption?.trim() || caption.trim()) || null;

          const { data, error: postError } = await supabase.rpc("create_moment", {
            p_event_id: eventId,
            p_content_type: material.contentType,
            p_media_url: null,
            p_text_content: textContent,
            p_user_id: userId,
            p_source_locale: locale,
            p_thumbnail_url: null,
            p_cf_video_uid: null,
            p_cf_playback_url: null,
            p_video_status: null,
            // Material fields
            p_file_url: material.fileUrl,
            p_original_filename: material.originalFilename,
            p_file_size: material.fileSize,
            p_mime_type: material.mimeType,
            // Audio metadata
            p_title: material.title || null,
            p_artist: material.artist || null,
            p_album: material.album || null,
            p_audio_duration_seconds: material.audioDurationSeconds || null,
            p_audio_thumbnail_url: material.audioThumbnailUrl || null,
            p_track_number: material.trackNumber || null,
            p_release_year: material.releaseYear || null,
            p_genre: material.genre || null,
          });

          if (postError) {
            console.error("create_moment RPC error:", postError.message, postError);
            if (postError.message.includes("not_allowed_to_post")) {
              setError(t("errors.notAllowed"));
              return;
            }
            throw postError;
          }

          if (data?.moment_id && textContent) {
            triggerTranslation("moment", data.moment_id, [
              { field_name: "text_content", text: textContent },
            ]);
          }
        }

        triggerHaptic("medium");
        const postedIds = new Set(readyMaterials.map(m => m.id));
        setMaterialUploads(prev => prev.filter(m => !postedIds.has(m.id)));
        setCaption("");

        const remaining = materialUploads.filter(m => !postedIds.has(m.id));
        if (remaining.length === 0) {
          if (onSuccess) {
            onSuccess();
          } else {
            router.push(`/events/${eventSlug}/moments`);
            router.refresh();
          }
        }
        return;
      }

      if (inputMode === "text") {
        // Post text-only moment
        const textContent = caption.trim();
        if (!textContent) {
          setError(t("errors.captionRequired"));
          return;
        }

        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: "text",
          p_media_url: null,
          p_text_content: textContent,
          p_user_id: userId,
          p_source_locale: locale,
          p_thumbnail_url: null,
          p_cf_video_uid: null,
          p_cf_playback_url: null,
          p_video_status: null,
        });

        if (postError) {
          console.error("create_moment RPC error:", postError.message, postError);
          if (postError.message.includes("not_allowed_to_post")) {
            setError(t("errors.notAllowed"));
            return;
          }
          throw postError;
        }

        if (data?.moment_id) {
          triggerTranslation("moment", data.moment_id, [
            { field_name: "text_content", text: textContent },
          ]);
        }

        triggerHaptic("medium");
        setCaption("");

        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/events/${eventSlug}/moments`);
          router.refresh();
        }
        return;
      }

      // Default: Photo/Video uploads (existing behavior)
      const readyUploads = uploads.filter(u =>
        u.status === "uploaded" && (u.mediaUrl || u.cfVideoUid)
      );

      if (readyUploads.length === 0) {
        setError(t("errors.uploadFailed"));
        return;
      }

      // Create a moment for each uploaded file with its individual caption
      for (const upload of readyUploads) {
        const contentType = upload.isVideo ? "video" : "photo";
        // Use individual caption if set, otherwise fall back to shared caption
        const textContent = (upload.caption?.trim() || caption.trim()) || null;

        // For Cloudflare Stream videos, use cfVideoUid; for legacy, use mediaUrl
        const isCloudflareVideo = upload.isVideo && upload.cfVideoUid;

        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: contentType,
          p_media_url: isCloudflareVideo ? null : upload.mediaUrl, // CF videos don't have direct media_url
          p_text_content: textContent,
          p_user_id: userId, // Support God Mode: attribute to effective user
          p_source_locale: locale, // Tag with user's current language for accurate translation attribution
          p_thumbnail_url: upload.thumbnailUrl || null, // Video thumbnail if available
          // Cloudflare Stream fields (for adaptive streaming)
          p_cf_video_uid: upload.cfVideoUid || null,
          p_cf_playback_url: upload.cfPlaybackUrl || null,
          p_video_status: isCloudflareVideo ? "processing" : "ready", // CF videos start as "processing"
        });

        if (postError) {
          console.error("create_moment RPC error:", postError.message, postError);
          if (postError.message.includes("not_allowed_to_post")) {
            setError(t("errors.notAllowed"));
            return;
          }
          throw postError;
        }

        if (data?.moment_id && textContent) {
          triggerTranslation("moment", data.moment_id, [
            { field_name: "text_content", text: textContent },
          ]);
        }

        // Fire-and-forget: Generate embedding for visual search (photos only)
        if (data?.moment_id && contentType === "photo") {
          fetch("/api/moments/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ momentId: data.moment_id }),
          }).catch(() => {
            // Non-critical - ignore embedding failures
          });
        }
      }

      triggerHaptic("medium");

      // Remove posted items from queue, keep uploading/errored ones
      const postedIds = new Set(readyUploads.map(u => u.id));
      setUploads(prev => {
        const remaining = prev.filter(u => !postedIds.has(u.id));
        // Clean up preview URLs for posted items
        prev.filter(u => postedIds.has(u.id)).forEach(u => {
          URL.revokeObjectURL(u.previewUrl);
          if (u.localThumbnailUrl) {
            URL.revokeObjectURL(u.localThumbnailUrl);
          }
        });
        return remaining;
      });
      setCaption(""); // Clear shared caption after posting

      // If there are still items uploading, stay on page
      const remainingUploads = uploads.filter(u => !postedIds.has(u.id));
      if (remainingUploads.length > 0) {
        // Stay on page so user can post remaining items when ready
        triggerHaptic("medium");
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/events/${eventSlug}/moments`);
        router.refresh();
      }
    } catch (err) {
      console.error("Post error:", err);
      setError(t("errors.postFailed"));
    } finally {
      setIsPosting(false);
    }
  };

  // Derived state based on input mode
  const isUploading = uploads.some(u =>
    u.status === "uploading" || u.status === "converting" || u.status === "compressing"
  ) || materialUploads.some(m => m.status === "uploading");

  // Ready to post depends on input mode
  const readyMediaCount = uploads.filter(u =>
    u.status === "uploaded" && (u.mediaUrl || u.cfVideoUid)
  ).length;
  const readyMaterialCount = materialUploads.filter(m =>
    m.status === "uploaded" && m.fileUrl
  ).length;

  const canPost = (() => {
    switch (inputMode) {
      case "youtube":
        return !!youtubePreview;
      case "file":
        return readyMaterialCount > 0;
      case "text":
        return caption.trim().length > 0;
      case "media":
      default:
        return readyMediaCount > 0;
    }
  })();

  const readyCount = inputMode === "file" ? readyMaterialCount : readyMediaCount;

  return (
    <div className="space-y-4">
      {/* Input mode selector */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        <button
          type="button"
          onClick={() => setInputMode("media")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
            inputMode === "media"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Camera className="w-4 h-4" />
          <span className="hidden sm:inline">{t("inputModes.media")}</span>
        </button>
        <button
          type="button"
          onClick={() => setInputMode("youtube")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
            inputMode === "youtube"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Youtube className="w-4 h-4" />
          <span className="hidden sm:inline">YouTube</span>
        </button>
        <button
          type="button"
          onClick={() => setInputMode("file")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
            inputMode === "file"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <File className="w-4 h-4" />
          <span className="hidden sm:inline">{t("inputModes.file")}</span>
        </button>
        <button
          type="button"
          onClick={() => setInputMode("text")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all",
            inputMode === "text"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">{t("inputModes.text")}</span>
        </button>
      </div>

      {/* YouTube input mode */}
      {inputMode === "youtube" && (
        <div className="space-y-3">
          <div className="relative">
            <Input
              type="url"
              value={youtubeUrl}
              onChange={(e) => handleYoutubeUrlChange(e.target.value)}
              placeholder={t("youtube.placeholder")}
              className="pr-10"
            />
            <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          {youtubeError && (
            <p className="text-sm text-destructive">{youtubeError}</p>
          )}
          {youtubePreview && (
            <div className="relative rounded-xl border border-border overflow-hidden bg-card">
              <img
                src={youtubePreview.thumbnailUrl}
                alt="YouTube video preview"
                className="w-full aspect-video object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
                  <Play className="w-8 h-8 text-white fill-current ml-1" />
                </div>
              </div>
              <button
                type="button"
                onClick={clearYoutubePreview}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* File upload mode (PDF, audio, documents) */}
      {inputMode === "file" && (
        <div className="space-y-3">
          {/* Material uploads preview */}
          {materialUploads.length > 0 && (
            <div className="space-y-3">
              {materialUploads.map((material) => {
                const Icon = CONTENT_TYPE_ICONS[material.contentType] || File;
                return (
                  <div key={material.id} className="rounded-xl border border-border overflow-hidden bg-card">
                    <div className="flex items-center gap-3 p-3">
                      {/* Icon or album art */}
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center",
                        material.contentType === "audio" && material.audioThumbnailUrl
                          ? "overflow-hidden"
                          : material.contentType === "pdf"
                          ? "bg-red-100 dark:bg-red-900/20"
                          : material.contentType === "audio"
                          ? "bg-purple-100 dark:bg-purple-900/20"
                          : "bg-muted"
                      )}>
                        {material.contentType === "audio" && material.audioThumbnailUrl ? (
                          <img
                            src={material.audioThumbnailUrl}
                            alt="Album art"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon className={cn(
                            "w-6 h-6",
                            material.contentType === "pdf"
                              ? "text-red-600 dark:text-red-400"
                              : material.contentType === "audio"
                              ? "text-purple-600 dark:text-purple-400"
                              : "text-muted-foreground"
                          )} />
                        )}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {material.title || material.originalFilename}
                        </p>
                        {material.artist && (
                          <p className="text-xs text-muted-foreground truncate">{material.artist}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(material.fileSize)}
                          {material.audioDurationSeconds && ` • ${formatAudioDuration(material.audioDurationSeconds)}`}
                        </p>
                      </div>

                      {/* Status/Remove */}
                      <div className="flex items-center gap-2">
                        {material.status === "uploading" && (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        )}
                        {material.status === "error" && (
                          <AlertCircle className="w-5 h-5 text-destructive" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(material.id)}
                          className="p-1.5 rounded-full hover:bg-muted active:scale-95 transition-all"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {/* Caption input for material */}
                    {material.status === "uploaded" && (
                      <input
                        type="text"
                        value={material.caption || ""}
                        onChange={(e) => handleMaterialCaptionChange(material.id, e.target.value)}
                        placeholder={t("addCaption")}
                        className="w-full px-3 py-2 bg-card text-sm border-t border-border focus:outline-none focus:bg-accent/50 transition-colors"
                        maxLength={500}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add file button */}
          <button
            type="button"
            onClick={() => materialFileInputRef.current?.click()}
            className={cn(
              "w-full py-8 rounded-xl border-2 border-dashed transition-all",
              "border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5",
              "flex flex-col items-center justify-center gap-3"
            )}
          >
            <div className="p-3 rounded-full bg-primary/10">
              <Upload className="w-6 h-6 text-primary/70" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">{t("file.tapToUpload")}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{t("file.supportedFormats")}</p>
            </div>
          </button>
        </div>
      )}

      {/* Text-only mode */}
      {inputMode === "text" && (
        <div className="p-4 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30">
          <p className="text-sm text-muted-foreground text-center mb-2">{t("text.description")}</p>
        </div>
      )}

      {/* Media upload area (photo/video) */}
      {inputMode === "media" && (
        <div className="space-y-3">
          {/* Preview list with per-image captions */}
          {uploads.length > 0 && (
          <div className="space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="rounded-xl border border-border overflow-hidden bg-card">
                {/* Image/video preview */}
                <div className="relative aspect-video bg-muted">
                  {upload.isVideo ? (
                    <>
                      {upload.localThumbnailUrl ? (
                        <img
                          src={upload.localThumbnailUrl}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={upload.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      )}
                      {/* Video duration badge */}
                      {upload.duration !== undefined && upload.duration > 0 && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded bg-black/70 text-white text-xs">
                          <Play className="w-3 h-3 fill-current" />
                          <span>{formatDuration(upload.duration)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <img
                      src={upload.previewUrl}
                      alt={upload.caption || "Preview"}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Upload status overlay */}
                  {upload.status === "converting" && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                      <RefreshCw className="w-6 h-6 text-white animate-spin" />
                      <span className="text-xs text-white/80">Converting...</span>
                    </div>
                  )}

                  {upload.status === "compressing" && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 px-8">
                      <RefreshCw className="w-6 h-6 text-white animate-spin" />
                      <span className="text-xs text-white/80">
                        {upload.compressionProgress?.message || "Compressing video..."}
                      </span>
                      {upload.compressionProgress && (
                        <div className="w-full max-w-[200px] h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/80 transition-all duration-300"
                            style={{ width: `${upload.compressionProgress.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {upload.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 px-8">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                      {upload.uploadProgress !== undefined && upload.uploadProgress > 0 && (
                        <>
                          <span className="text-xs text-white/80">
                            Uploading... {upload.uploadProgress}%
                          </span>
                          <div className="w-full max-w-[200px] h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white/80 transition-all duration-300"
                              style={{ width: `${upload.uploadProgress}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {upload.status === "processing" && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                      <span className="text-xs text-white/80">Processing video...</span>
                    </div>
                  )}

                  {upload.status === "error" && (
                    <div className="absolute inset-0 bg-red-500/50 flex flex-col items-center justify-center gap-2 px-4">
                      <AlertCircle className="w-6 h-6 text-white" />
                      <span className="text-xs text-white text-center font-medium">
                        {upload.error || t("errors.uploadFailed")}
                      </span>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveUpload(upload.id)}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 active:scale-95 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Per-image caption input - only shown when multiple uploads */}
                {upload.status === "uploaded" && readyCount > 1 && (
                  <input
                    type="text"
                    value={upload.caption || ""}
                    onChange={(e) => handleCaptionChange(upload.id, e.target.value)}
                    placeholder={t("addCaption")}
                    className="w-full px-3 py-3 bg-card text-sm border-t border-border focus:outline-none focus:bg-accent/50 transition-colors"
                    maxLength={500}
                  />
                )}
              </div>
            ))}

            {/* Add more button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Plus className="w-5 h-5 text-muted-foreground/60" />
              <span className="text-sm text-muted-foreground">{t("addMore")}</span>
            </button>
          </div>
        )}

        {/* Empty state drop zone */}
        {uploads.length === 0 && (
          <div
            className={cn(
              "relative aspect-[4/3] rounded-2xl overflow-hidden transition-all cursor-pointer",
              "bg-gradient-to-br from-muted to-muted/50",
              isDragOver
                ? "border-2 border-primary border-dashed scale-[0.98]"
                : "border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:from-primary/5 hover:to-primary/10"
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Camera className="w-10 h-10 text-primary/70" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {t("tapToUpload")}
              </span>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Caption input - varies by mode */}
      {inputMode === "text" ? (
        // Text-only mode: larger text area, required
        <AIEnhanceTextarea
          value={caption}
          onChange={setCaption}
          placeholder={t("text.placeholder")}
          className="w-full min-h-[120px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          maxLength={1000}
          context="a text moment shared at an event - a thought, memory, or comment"
        />
      ) : inputMode === "youtube" || inputMode === "file" ? (
        // YouTube/File mode: optional caption
        <AIEnhanceTextarea
          value={caption}
          onChange={setCaption}
          placeholder={t("addCaption")}
          className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          maxLength={500}
          context={inputMode === "youtube"
            ? "a caption for a YouTube video shared at an event"
            : "a caption for a file shared at an event"}
        />
      ) : readyCount <= 1 ? (
        // Media mode, single image: use shared caption
        <AIEnhanceTextarea
          value={caption}
          onChange={setCaption}
          placeholder={t("addCaption")}
          className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          maxLength={500}
          context="a moment caption for a photo or video shared at an event"
        />
      ) : (
        // Media mode, multiple images: per-image captions with optional shared default
        <div className="space-y-3">
          {/* Shared caption that applies to images without custom caption */}
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("sharedCaption")}</label>
            <AIEnhanceTextarea
              value={caption}
              onChange={setCaption}
              placeholder={t("sharedCaptionPlaceholder")}
              className="w-full min-h-[60px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow text-sm"
              maxLength={500}
              context="a moment caption for photos or videos shared at an event"
            />
          </div>
          {/* Individual captions for each uploaded image */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("individualCaptions")}</label>
            {uploads.filter(u => u.status === "uploaded").map((upload) => (
              <div key={upload.id} className="flex gap-2 items-start">
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-muted relative">
                  {upload.isVideo ? (
                    <>
                      <img
                        src={upload.localThumbnailUrl || upload.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <Play className="absolute bottom-0.5 right-0.5 w-3 h-3 text-white drop-shadow-md fill-current" />
                    </>
                  ) : (
                    <img src={upload.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <input
                  type="text"
                  value={upload.caption ?? ""}
                  onChange={(e) => handleCaptionChange(upload.id, e.target.value)}
                  placeholder={caption.trim() ? `${t("usesShared")}` : t("addCaption")}
                  className="flex-1 p-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  maxLength={500}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Post button - enabled when any uploads ready, even if others still uploading */}
      <Button
        onClick={handlePost}
        disabled={!canPost || isPosting}
        className="w-full"
        size="lg"
      >
        {isPosting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t("posting")}
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            {inputMode === "youtube" ? (
              t("postYoutube")
            ) : inputMode === "text" ? (
              t("postText")
            ) : inputMode === "file" ? (
              readyMaterialCount > 1
                ? t("postMoments", { count: readyMaterialCount })
                : t("postFile")
            ) : isUploading && readyCount > 0 ? (
              // Some ready, some still uploading - post partial
              t("postReady", { ready: readyCount, total: uploads.length })
            ) : readyCount > 1 ? (
              t("postMoments", { count: readyCount })
            ) : (
              t("postMoment")
            )}
          </>
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_ALLOWED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
        multiple
      />

      {/* Material file input (PDF, audio, documents) */}
      <input
        ref={materialFileInputRef}
        type="file"
        accept={MATERIAL_ALLOWED_MIME_TYPES.join(",")}
        onChange={handleMaterialFileSelect}
        className="hidden"
        multiple
      />
    </div>
  );
}
