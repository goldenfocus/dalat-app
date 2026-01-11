"use client";

import { useState, useRef, useCallback } from "react";
import { ImageIcon, X, Upload, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  validateMediaFile,
  isVideoUrl,
  ALL_ALLOWED_TYPES,
} from "@/lib/media-utils";

interface EventMediaUploadProps {
  eventId: string;
  currentMediaUrl: string | null;
  onMediaChange: (url: string | null) => void;
}

export function EventMediaUpload({
  eventId,
  currentMediaUrl,
  onMediaChange,
}: EventMediaUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentMediaUrl);
  const [previewIsVideo, setPreviewIsVideo] = useState<boolean>(
    isVideoUrl(currentMediaUrl)
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMedia = async (file: File) => {
    setError(null);

    const validationError = validateMediaFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setPreviewIsVideo(file.type.startsWith("video/"));

    setIsUploading(true);

    try {
      const supabase = createClient();

      // Generate unique filename
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      // Delete old media if exists
      if (currentMediaUrl) {
        const oldPath = currentMediaUrl.split("/event-media/")[1];
        if (oldPath) {
          await supabase.storage.from("event-media").remove([oldPath]);
        }
      }

      // Upload new media
      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("event-media").getPublicUrl(fileName);

      onMediaChange(publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload. Please try again.");
      setPreviewUrl(currentMediaUrl);
      setPreviewIsVideo(isVideoUrl(currentMediaUrl));
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMedia(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        uploadMedia(file);
      }
    },
    [eventId, currentMediaUrl]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemove = async () => {
    if (!currentMediaUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Extract path from URL
      const oldPath = currentMediaUrl.split("/event-media/")[1];
      if (oldPath) {
        await supabase.storage.from("event-media").remove([oldPath]);
      }

      setPreviewUrl(null);
      setPreviewIsVideo(false);
      onMediaChange(null);
    } catch (err) {
      console.error("Remove error:", err);
      setError("Failed to remove. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Media preview area */}
      <div
        className={cn(
          "relative aspect-[2/1] rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer group",
          isDragOver
            ? "border-primary border-dashed"
            : "border-transparent hover:border-muted-foreground/20"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          previewIsVideo ? (
            <video
              src={previewUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : (
            <img
              src={previewUrl}
              alt="Event media"
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/5 gap-2">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Drop an image or video here
            </span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-white" />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {previewUrl ? "Replace" : "Upload"}
            </>
          )}
        </Button>

        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isUploading}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
            Remove
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_ALLOWED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        JPEG, PNG, WebP, GIF (up to 15MB), or MP4/WebM video (up to 50MB)
      </p>
    </div>
  );
}
