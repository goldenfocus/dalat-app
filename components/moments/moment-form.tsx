"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImageIcon, X, Upload, Loader2, Send, Type, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  validateMediaFile,
  ALL_ALLOWED_TYPES,
} from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { triggerTranslation } from "@/lib/translations-client";

interface MomentFormProps {
  eventId: string;
  eventSlug: string;
  userId: string;
  onSuccess?: () => void;
}

type ContentMode = "media" | "text";

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  status: "uploading" | "uploaded" | "error";
  mediaUrl?: string;
  error?: string;
}

export function MomentForm({ eventId, eventSlug, userId, onSuccess }: MomentFormProps) {
  const t = useTranslations("moments");
  const router = useRouter();

  const [mode, setMode] = useState<ContentMode>("media");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [caption, setCaption] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File, itemId: string) => {
    try {
      const supabase = createClient();

      // Generate unique filename: {event_id}/{user_id}/{timestamp}_{random}.{ext}
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Upload media
      const { error: uploadError } = await supabase.storage
        .from("moments")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("moments")
        .getPublicUrl(fileName);

      setUploads(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, status: "uploaded" as const, mediaUrl: publicUrl }
          : item
      ));
      triggerHaptic("light");
    } catch (err) {
      console.error("Upload error:", err);
      setUploads(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, status: "error" as const, error: t("errors.uploadFailed") }
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
      const isVideo = file.type.startsWith("video/");

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

    // Start uploading each file
    for (const item of newUploads) {
      uploadFile(item.file, item.id);
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
      }
      return prev.filter(u => u.id !== itemId);
    });
  };

  const handlePost = async () => {
    // Validate content
    const readyUploads = uploads.filter(u => u.status === "uploaded" && u.mediaUrl);

    if (mode === "media" && readyUploads.length === 0) {
      setError(t("errors.uploadFailed"));
      return;
    }
    if (mode === "text" && !caption.trim()) {
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      const supabase = createClient();
      const textContent = caption.trim() || null;

      if (mode === "text") {
        // Text-only moment
        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: "text",
          p_media_url: null,
          p_text_content: textContent,
        });

        if (postError) {
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
      } else {
        // Create a moment for each uploaded file
        for (const upload of readyUploads) {
          const contentType = upload.isVideo ? "video" : "photo";

          const { data, error: postError } = await supabase.rpc("create_moment", {
            p_event_id: eventId,
            p_content_type: contentType,
            p_media_url: upload.mediaUrl,
            p_text_content: textContent,
          });

          if (postError) {
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
      }

      triggerHaptic("medium");

      if (onSuccess) {
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

  const isUploading = uploads.some(u => u.status === "uploading");
  const readyCount = uploads.filter(u => u.status === "uploaded" && u.mediaUrl).length;
  const canPost = mode === "text"
    ? caption.trim().length > 0
    : readyCount > 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "media" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("media")}
          className="flex-1"
        >
          <ImageIcon className="w-4 h-4 mr-2" />
          {t("uploadMedia")}
        </Button>
        <Button
          type="button"
          variant={mode === "text" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("text")}
          className="flex-1"
        >
          <Type className="w-4 h-4 mr-2" />
          {t("textOnly")}
        </Button>
      </div>

      {/* Media upload area */}
      {mode === "media" && (
        <div className="space-y-3">
          {/* Preview grid */}
          {uploads.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                >
                  {upload.isVideo ? (
                    <video
                      src={upload.previewUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={upload.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Upload status overlay */}
                  {upload.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}

                  {upload.status === "error" && (
                    <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                      <X className="w-6 h-6 text-white" />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveUpload(upload.id)}
                    className="absolute top-1 right-1 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Add more button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 flex items-center justify-center transition-colors"
              >
                <Plus className="w-6 h-6 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Empty state drop zone */}
          {uploads.length === 0 && (
            <div
              className={cn(
                "relative aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer",
                isDragOver
                  ? "border-primary border-dashed"
                  : "border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                <ImageIcon className="w-12 h-12 text-muted-foreground" />
                <span className="text-sm text-muted-foreground text-center px-4">
                  {t("uploadMedia")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Caption / Text input */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={mode === "text" ? t("captionPlaceholder") : t("addCaption")}
        className="w-full min-h-[100px] p-3 rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        maxLength={500}
      />

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Post button */}
      <Button
        onClick={handlePost}
        disabled={!canPost || isUploading || isPosting}
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
            {readyCount > 1 ? t("postMoments", { count: readyCount }) : t("postMoment")}
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
    </div>
  );
}
