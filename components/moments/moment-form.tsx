"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
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
  caption?: string; // Individual caption for this upload
}

export function MomentForm({ eventId, eventSlug, userId, onSuccess }: MomentFormProps) {
  const t = useTranslations("moments");
  const locale = useLocale();
  const router = useRouter();

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [caption, setCaption] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      console.log("[Upload] Proceeding to upload:", fileToUpload.name, fileToUpload.type);
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

  const handleCaptionChange = (itemId: string, newCaption: string) => {
    setUploads(prev => prev.map(item =>
      item.id === itemId ? { ...item, caption: newCaption } : item
    ));
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

      // Create a moment for each uploaded file with its individual caption
      for (const upload of readyUploads) {
        const contentType = upload.isVideo ? "video" : "photo";
        // Use individual caption if set, otherwise fall back to shared caption
        const textContent = (upload.caption?.trim() || caption.trim()) || null;

        const { data, error: postError } = await supabase.rpc("create_moment", {
          p_event_id: eventId,
          p_content_type: contentType,
          p_media_url: upload.mediaUrl,
          p_text_content: textContent,
          p_user_id: userId, // Support God Mode: attribute to effective user
          p_source_locale: locale, // Tag with user's current language for accurate translation attribution
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
        {/* Preview list with per-image captions */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="rounded-xl border border-border overflow-hidden bg-card">
                {/* Image/video preview */}
                <div className="relative aspect-video bg-muted">
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
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 active:scale-95 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Per-image caption input - directly attached below image */}
                {upload.status === "uploaded" && (
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

      {/* Caption input - shared or per-image */}
      {readyCount <= 1 ? (
        // Single image: use shared caption
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t("addCaption")}
          className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          maxLength={500}
        />
      ) : (
        // Multiple images: per-image captions with optional shared default
        <div className="space-y-3">
          {/* Shared caption that applies to images without custom caption */}
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("sharedCaption")}</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("sharedCaptionPlaceholder")}
              className="w-full min-h-[60px] p-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow text-sm"
              maxLength={500}
            />
          </div>
          {/* Individual captions for each uploaded image */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("individualCaptions")}</label>
            {uploads.filter(u => u.status === "uploaded").map((upload, index) => (
              <div key={upload.id} className="flex gap-2 items-start">
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                  {upload.isVideo ? (
                    <video src={upload.previewUrl} className="w-full h-full object-cover" muted />
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
