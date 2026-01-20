"use client";

import { useState, useRef } from "react";
import { Building2, X, Upload, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AIOrganizerLogoDialog } from "@/components/admin/ai-organizer-logo-dialog";

interface OrganizerLogoUploadProps {
  organizerId?: string;
  organizerName?: string;
  currentLogoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function OrganizerLogoUpload({
  organizerId,
  organizerName,
  currentLogoUrl,
  onLogoChange,
}: OrganizerLogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
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

    // Create preview
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
    if (file) uploadLogo(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadLogo(file);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    onLogoChange(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Logo</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative w-32 h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden",
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isUploading && "pointer-events-none"
        )}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Logo preview"
              className="w-full h-full object-cover"
            />
            {!isUploading && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Building2 className="w-8 h-8 mb-2" />
            <span className="text-xs">Upload logo</span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Square image recommended. Max 5MB.
      </p>

      {/* AI Logo Generation */}
      {organizerName && (
        <AIOrganizerLogoDialog
          organizerId={organizerId}
          organizerName={organizerName}
          currentLogoUrl={previewUrl}
          onLogoGenerated={(url) => {
            setPreviewUrl(url);
            onLogoChange(url);
          }}
          disabled={isUploading}
        />
      )}
    </div>
  );
}
