"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Loader2, Upload, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VenuePhoto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface VenueOfficialPhotosUploadProps {
  venueId: string;
  currentPhotos: VenuePhoto[];
  onPhotosChange?: (photos: VenuePhoto[]) => void;
}

interface PendingPhoto {
  file: File;
  preview: string;
  caption: string;
}

export function VenueOfficialPhotosUpload({
  venueId,
  currentPhotos,
  onPhotosChange,
}: VenueOfficialPhotosUploadProps) {
  const t = useTranslations("venues");
  const [isOpen, setIsOpen] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);

    const newPending: PendingPhoto[] = files
      .filter((file) => {
        // Validate file type
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!validTypes.includes(file.type)) {
          setError("Only JPEG, PNG, WebP, and GIF images are allowed");
          return false;
        }
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          setError("File size must be under 10MB");
          return false;
        }
        return true;
      })
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        caption: "",
      }));

    setPendingPhotos((prev) => [...prev, ...newPending]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePending = (index: number) => {
    setPendingPhotos((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleCaptionChange = (index: number, caption: string) => {
    setPendingPhotos((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption };
      return updated;
    });
  };

  const handleUpload = async () => {
    if (pendingPhotos.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const uploadedPhotos: VenuePhoto[] = [];

      // Upload each photo
      for (const pending of pendingPhotos) {
        const ext = pending.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `${venueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("venue-media")
          .upload(fileName, pending.file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload: ${uploadError.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("venue-media").getPublicUrl(fileName);

        uploadedPhotos.push({
          url: publicUrl,
          caption: pending.caption || undefined,
          sort_order: currentPhotos.length + uploadedPhotos.length,
        });
      }

      // Update venue with new photos
      const newPhotos = [...currentPhotos, ...uploadedPhotos];
      const { error: updateError } = await supabase
        .from("venues")
        .update({
          photos: newPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", venueId);

      if (updateError) {
        throw new Error(`Failed to save: ${updateError.message}`);
      }

      // Cleanup previews
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPendingPhotos([]);
      setIsOpen(false);

      // Notify parent
      onPhotosChange?.(newPhotos);

      // Refresh the page to show new photos
      window.location.reload();
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    // Cleanup previews
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
    setError(null);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        {t("addOfficialPhotos")}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addOfficialPhotos")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* File input area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to select photos
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG, WebP, GIF (max 10MB each)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Pending photos preview */}
            {pendingPhotos.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {pendingPhotos.length} photo(s) ready to upload
                </p>
                {pendingPhotos.map((photo, index) => (
                  <div
                    key={photo.preview}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <img
                      src={photo.preview}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Input
                        placeholder="Caption (optional)"
                        value={photo.caption}
                        onChange={(e) =>
                          handleCaptionChange(index, e.target.value)
                        }
                        className="text-sm"
                      />
                    </div>
                    <button
                      onClick={() => handleRemovePending(index)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      disabled={isUploading}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={pendingPhotos.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                `Upload ${pendingPhotos.length} photo(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
