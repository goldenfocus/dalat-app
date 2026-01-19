"use client";

import { useState, useRef } from "react";
import { User, X, Upload, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PersonaImageUploadProps {
  personaId?: string;
  currentImages: string[];
  onImagesChange: (urls: string[]) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES = 3;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PersonaImageUpload({
  personaId,
  currentImages,
  onImagesChange,
}: PersonaImageUploadProps) {
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

  const uploadImage = async (file: File) => {
    setError(null);

    if (currentImages.length >= MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);

    try {
      const supabase = createClient();

      // Use personaId or temp ID
      const id = personaId || `temp-${Date.now()}`;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Upload
      const { error: uploadError } = await supabase.storage
        .from("persona-references")
        .upload(fileName, file, {
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("persona-references").getPublicUrl(fileName);

      onImagesChange([...currentImages, publicUrl]);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadImage(file);
  };

  const handleRemove = async (index: number) => {
    const urlToRemove = currentImages[index];
    const newImages = currentImages.filter((_, i) => i !== index);
    onImagesChange(newImages);

    // Try to delete from storage
    try {
      const supabase = createClient();
      const path = urlToRemove.split("/persona-references/")[1];
      if (path) {
        await supabase.storage.from("persona-references").remove([path]);
      }
    } catch {
      // Ignore deletion errors
    }
  };

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
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="grid grid-cols-3 gap-3">
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
        {currentImages.length < MAX_IMAGES && (
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
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <>
                <Plus className="w-6 h-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Add photo</span>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Upload 1-3 clear reference photos. The AI will use these to recognize
        and render this person in generated images.
      </p>
    </div>
  );
}
