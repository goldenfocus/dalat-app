"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Building2, X, Upload, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadFile, deleteFile } from "@/lib/storage/client";

interface OrganizerLogoUploadProps {
  organizerId?: string;
  organizerName?: string;
  currentLogoUrl: string | null;
  onLogoChange: (url: string | null) => void;
  size?: "sm" | "md" | "lg";
  aiLogoButton?: React.ReactNode;
  /** Storage bucket name (default: "organizer-logos") */
  bucket?: string;
  /** Auto-save logo_url to database on upload (default: true when organizerId is provided) */
  autoSave?: boolean;
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
  bucket = "organizer-logos",
  autoSave = true,
}: OrganizerLogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [showSaved, setShowSaved] = useState(false);

  // Sync previewUrl when currentLogoUrl changes externally (e.g., AI logo generation)
  useEffect(() => {
    setPreviewUrl(currentLogoUrl);
  }, [currentLogoUrl]);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save logo_url to database
  const saveToDatabase = async (url: string | null) => {
    if (!autoSave || !organizerId) return;

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("organizers")
        .update({ logo_url: url })
        .eq("id", organizerId);

      if (updateError) {
        console.error("Auto-save failed:", updateError);
        setError("Failed to save logo. Please try again.");
      } else {
        // Show brief "Saved" indicator
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } catch (err) {
      console.error("Auto-save error:", err);
      setError("Failed to save logo. Please try again.");
    }
  };

  // Wrapper that saves and notifies parent
  const handleLogoUpdate = async (url: string | null) => {
    onLogoChange(url);
    await saveToDatabase(url);
  };

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
      // Delete old logo if exists
      if (currentLogoUrl) {
        await deleteFile(bucket, currentLogoUrl);
      }

      // Upload using unified storage abstraction (R2 or Supabase)
      const result = await uploadFile(bucket, file, {
        entityId: organizerId || `temp-${Date.now()}`,
      });

      // Update preview to the actual uploaded URL
      setPreviewUrl(result.publicUrl);
      await handleLogoUpdate(result.publicUrl);
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
    [organizerId, currentLogoUrl, bucket]
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
      // Delete using unified storage abstraction
      await deleteFile(bucket, currentLogoUrl);

      setPreviewUrl(null);
      await handleLogoUpdate(null);
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

          {/* Auto-save indicator */}
          {showSaved && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-green-500/90 text-white text-xs font-medium flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved
            </div>
          )}
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
