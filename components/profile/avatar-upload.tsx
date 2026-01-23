"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, Upload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateSmartFilename } from "@/lib/media-utils";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  size?: "sm" | "md" | "lg";
  aiAvatarButton?: React.ReactNode;
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-32 h-32",
};

const iconSizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  onAvatarChange,
  size = "lg",
  aiAvatarButton,
}: AvatarUploadProps) {
  const t = useTranslations("profile");
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);

  // Sync previewUrl when currentAvatarUrl changes externally (e.g., AI avatar generation)
  useEffect(() => {
    setPreviewUrl(currentAvatarUrl);
  }, [currentAvatarUrl]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!allowedTypes.includes(file.type)) {
      return t("invalidFileType");
    }

    if (file.size > maxSize) {
      return t("fileTooLarge");
    }

    return null;
  };

  const uploadAvatar = async (file: File) => {
    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setIsUploading(true);

    try {
      const supabase = createClient();

      // Generate smart filename from original file name
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = generateSmartFilename(file.name, userId, ext);

      // Delete old avatar if exists
      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split("/avatars/")[1];
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from("avatars")
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
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      onAvatarChange(publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
      setError(t("uploadFailed"));
      setPreviewUrl(currentAvatarUrl);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadAvatar(file);
      }
    },
    [userId, currentAvatarUrl]
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
    if (!currentAvatarUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Extract path from URL
      const oldPath = currentAvatarUrl.split("/avatars/")[1];
      if (oldPath) {
        await supabase.storage.from("avatars").remove([oldPath]);
      }

      setPreviewUrl(null);
      onAvatarChange(null);
    } catch (err) {
      console.error("Remove error:", err);
      setError(t("removeFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        {/* Avatar preview */}
        <div
          className={cn(
            "relative rounded-full overflow-hidden bg-muted border-2 transition-colors cursor-pointer group shrink-0",
            sizeClasses[size],
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
            <img
              src={previewUrl}
              alt={t("profilePhoto")}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <Camera
                className={cn("text-muted-foreground", iconSizeClasses[size])}
              />
            </div>
          )}

          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {isUploading ? (
              <Loader2
                className={cn(
                  "text-white animate-spin",
                  iconSizeClasses[size]
                )}
              />
            ) : (
              <Upload className={cn("text-white", iconSizeClasses[size])} />
            )}
          </div>
        </div>

        {/* Actions - wrap on mobile */}
        <div className="flex flex-wrap items-center gap-2">
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
                {t("uploading")}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t("uploadPhoto")}
              </>
            )}
          </Button>

          {aiAvatarButton}

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
              {t("remove")}
            </Button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
