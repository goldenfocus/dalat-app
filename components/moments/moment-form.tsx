"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, X, Loader2, Send, Plus, AlertCircle, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  validateMediaFile,
  ALL_ALLOWED_TYPES,
  needsConversion,
} from "@/lib/media-utils";
import { convertIfNeeded } from "@/lib/media-conversion";
import { triggerHaptic } from "@/lib/haptics";
import { triggerTranslation } from "@/lib/translations-client";

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
  status: "converting" | "uploading" | "uploaded" | "error";
  mediaUrl?: string;
  error?: string;
}

export function MomentForm({ eventId, eventSlug, userId, onSuccess }: MomentFormProps) {
  const t = useTranslations("moments");
  const router = useRouter();

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [caption, setCaption] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File, itemId: string) => {
    try {
      let fileToUpload = file;

      // Convert if needed (HEIC → JPEG, MOV → MP4)
      if (needsConversion(file)) {
        setUploads(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: "converting" as const }
            : item
        ));

        try {
          fileToUpload = await convertIfNeeded(file);
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
          console.error("Conversion error:", err);
          setUploads(prev => prev.map(item =>
            item.id === itemId
              ? { ...item, status: "error" as const, error: err instanceof Error ? err.message : "Conversion failed" }
              : item
          ));
          return;
        }
      }

      setUploads(prev => prev.map(item =>
        item.id === itemId && item.status !== "error"
          ? { ...item, status: "uploading" as const }
          : item
      ));

      const supabase = createClient();

      // Generate unique filename (use converted file's extension)
      const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Upload media
      const { error: uploadError } = await supabase.storage
        .from("moments")
        .upload(fileName, fileToUpload, {
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
    const readyUploads = uploads.filter(u => u.status === "uploaded" && u.mediaUrl);

    if (readyUploads.length === 0) {
      setError(t("errors.uploadFailed"));
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      const supabase = createClient();
      const textContent = caption.trim() || null;

      // Create a moment for each uploaded file
      for (const upload of readyUploads) {
        const contentType = upload.isVideo ? "video" : "photo";

        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: contentType,
          p_media_url: upload.mediaUrl,
          p_text_content: textContent,
          p_user_id: userId, // Support God Mode: attribute to effective user
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

  const isUploading = uploads.some(u => u.status === "uploading" || u.status === "converting");
  const readyCount = uploads.filter(u => u.status === "uploaded" && u.mediaUrl).length;
  const canPost = readyCount > 0;

  return (
    <div className="space-y-4">
      {/* Media upload area */}
      <div className="space-y-3">
        {/* Preview grid */}
        {uploads.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="relative aspect-square rounded-xl overflow-hidden bg-muted"
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
                {upload.status === "converting" && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                    <RefreshCw className="w-6 h-6 text-white animate-spin" />
                    <span className="text-xs text-white/80">Converting...</span>
                  </div>
                )}

                {upload.status === "uploading" && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}

                {upload.status === "error" && (
                  <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                )}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemoveUpload(upload.id)}
                  className="absolute top-1.5 right-1.5 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 active:scale-95 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Add more button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center transition-all active:scale-95"
            >
              <Plus className="w-8 h-8 text-muted-foreground/60" />
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

      {/* Caption input */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={t("addCaption")}
        className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
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
