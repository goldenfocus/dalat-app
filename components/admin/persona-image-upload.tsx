"use client";

import { useState, useRef } from "react";
import { X, Loader2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadFile, deleteFile } from "@/lib/storage/client";

interface PersonaImageUploadProps {
  personaId?: string;
  currentImages: string[];
  onImagesChange: (urls: string[]) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_IMAGES = 5; // More angles = better recognition
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PersonaImageUpload({
  personaId,
  currentImages,
  onImagesChange,
}: PersonaImageUploadProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: Only JPG, PNG, and WebP allowed`;
    }
    if (file.size > MAX_SIZE) {
      return `${file.name}: Must be under 5MB`;
    }
    return null;
  };

  const uploadFiles = async (files: File[]) => {
    setError(null);

    const remainingSlots = MAX_IMAGES - currentImages.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    // Take only as many files as we have slots for
    const filesToUpload = files.slice(0, remainingSlots);

    // Validate all files first
    const errors: string[] = [];
    const validFiles: File[] = [];

    for (const file of filesToUpload) {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      setError(errors.join("; "));
    }

    if (validFiles.length === 0) return;

    setUploadingCount(validFiles.length);

    try {
      const id = personaId || `temp-${Date.now()}`;
      const uploadedUrls: string[] = [];

      // Upload all files in parallel using unified storage abstraction
      await Promise.all(
        validFiles.map(async (file) => {
          const result = await uploadFile("persona-references", file, {
            entityId: id,
          });
          uploadedUrls.push(result.publicUrl);
        })
      );

      onImagesChange([...currentImages, ...uploadedUrls]);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload some images. Please try again.");
    } finally {
      setUploadingCount(0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadFiles(files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  };

  const handleRemove = async (index: number) => {
    const urlToRemove = currentImages[index];
    const newImages = currentImages.filter((_, i) => i !== index);
    onImagesChange(newImages);

    // Delete from storage using unified abstraction
    try {
      await deleteFile("persona-references", urlToRemove);
    } catch {
      // Ignore deletion errors
    }
  };

  const isUploading = uploadingCount > 0;
  const slotsRemaining = MAX_IMAGES - currentImages.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Reference images * ({currentImages.length}/{MAX_IMAGES})
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {/* Existing images */}
        {currentImages.map((url, index) => (
          <div
            key={url}
            className="relative aspect-square rounded-lg border overflow-hidden bg-muted"
          >
            <img
              src={url}
              alt={`Reference ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => handleRemove(index)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}

        {/* Upload slot */}
        {slotsRemaining > 0 && (
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "relative aspect-square rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center",
              isDragOver
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              isUploading && "pointer-events-none"
            )}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground mt-1">
                  {uploadingCount} uploading...
                </span>
              </>
            ) : (
              <>
                <ImagePlus className="w-6 h-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground text-center px-1">
                  Add {slotsRemaining > 1 ? "photos" : "photo"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Upload 1-5 clear reference photos (select multiple at once). More angles = better AI recognition.
      </p>
    </div>
  );
}
