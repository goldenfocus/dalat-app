"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Building2, X, Upload, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrganizerLogoUploadProps {
  organizerId?: string;
  organizerName?: string;
  currentLogoUrl: string | null;
  onLogoChange: (url: string | null) => void;
  size?: "sm" | "md" | "lg";
  aiLogoButton?: React.ReactNode;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

export function OrganizerLogoUpload({
  organizerId,
  organizerName,
  currentLogoUrl,
  onLogoChange,
  size = "lg",
  aiLogoButton,
}: OrganizerLogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);

  // Sync previewUrl when currentLogoUrl changes externally (e.g., AI logo generation)
  useEffect(() => {
    setPreviewUrl(currentLogoUrl);
  }, [currentLogoUrl]);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Only JPG, PNG, and WebP images are allowed";
    }
    if (file.size > MAX_SIZE) {
      return "File must be under 5MB";
    }
    return null;
  };

  const uploadLogo = async (file: File) => {
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

      // Use organizerId or temp ID for new organizers
      const id = organizerId || `temp-${Date.now()}`;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${id}/${Date.now()}.${ext}`;

      // Delete old logo if exists
      if (currentLogoUrl) {
        const oldPath = currentLogoUrl.split("/organizer-logos/")[1];
        if (oldPath) {
          await supabase.storage.from("organizer-logos").remove([oldPath]);
        }
      }

      // Upload
      const { error: uploadError } = await supabase.storage
        .from("organizer-logos")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("organizer-logos").getPublicUrl(fileName);

      onLogoChange(publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload. Please try again.");
      setPreviewUrl(currentLogoUrl);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogo(file);
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
        uploadLogo(file);
      }
    },
    [organizerId, currentLogoUrl]
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
    if (!currentLogoUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Extract path from URL
      const oldPath = currentLogoUrl.split("/organizer-logos/")[1];
      if (oldPath) {
        await supabase.storage.from("organizer-logos").remove([oldPath]);
      }

      setPreviewUrl(null);
      onLogoChange(null);
    } catch (err) {
      console.error("Remove error:", err);
      setError("Failed to remove logo");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        {/* Logo preview */}
        <div
          className={cn(
            "relative rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer group shrink-0",
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
              alt="Logo"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <Building2
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
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Logo
              </>
            )}
          </Button>

          {aiLogoButton}

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
          accept={ALLOWED_TYPES.join(",")}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
