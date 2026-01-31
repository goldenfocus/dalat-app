"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Loader2, Upload, Trash2, Pencil, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VenuePhoto } from "@/lib/types";
import { uploadFile, deleteFile } from "@/lib/storage/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VenuePhotoManagerProps {
  venueId: string;
  photos: VenuePhoto[];
}

interface PendingPhoto {
  file: File;
  preview: string;
  caption: string;
}

export function VenuePhotoManager({ venueId, photos: initialPhotos }: VenuePhotoManagerProps) {
  const t = useTranslations("venues");
  const [photos, setPhotos] = useState<VenuePhoto[]>(initialPhotos);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deletePhotoUrl, setDeletePhotoUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Caption editing state
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionValue, setCaptionValue] = useState("");
  const [isSavingCaption, setIsSavingCaption] = useState(false);

  const sortedPhotos = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);

    const newPending: PendingPhoto[] = files
      .filter((file) => {
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!validTypes.includes(file.type)) {
          setError("Only JPEG, PNG, WebP, and GIF images are allowed");
          return false;
        }
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

      // Upload using unified storage abstraction (R2 or Supabase)
      for (const pending of pendingPhotos) {
        const result = await uploadFile("venue-media", pending.file, {
          entityId: venueId,
        });

        uploadedPhotos.push({
          url: result.publicUrl,
          caption: pending.caption || undefined,
          sort_order: photos.length + uploadedPhotos.length,
        });
      }

      const newPhotos = [...photos, ...uploadedPhotos];
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

      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPendingPhotos([]);
      setIsUploadOpen(false);
      setPhotos(newPhotos);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseUpload = () => {
    if (isUploading) return;
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
    setError(null);
    setIsUploadOpen(false);
  };

  const handleDeletePhoto = async () => {
    if (!deletePhotoUrl) return;

    setIsDeleting(true);
    try {
      const supabase = createClient();

      // Remove photo from array
      const newPhotos = photos
        .filter((p) => p.url !== deletePhotoUrl)
        .map((p, i) => ({ ...p, sort_order: i })); // Re-index sort_order

      const { error: updateError } = await supabase
        .from("venues")
        .update({
          photos: newPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", venueId);

      if (updateError) {
        throw new Error(`Failed to delete: ${updateError.message}`);
      }

      // Delete from storage using unified abstraction
      try {
        await deleteFile("venue-media", deletePhotoUrl);
      } catch {
        // Storage deletion is best-effort
      }

      setPhotos(newPhotos);
      setDeletePhotoUrl(null);
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEditCaption = (photo: VenuePhoto) => {
    setEditingCaption(photo.url);
    setCaptionValue(photo.caption || "");
  };

  const handleSaveCaption = async () => {
    if (editingCaption === null) return;

    setIsSavingCaption(true);
    try {
      const supabase = createClient();

      const newPhotos = photos.map((p) =>
        p.url === editingCaption
          ? { ...p, caption: captionValue.trim() || undefined }
          : p
      );

      const { error: updateError } = await supabase
        .from("venues")
        .update({
          photos: newPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", venueId);

      if (updateError) {
        throw new Error(`Failed to save caption: ${updateError.message}`);
      }

      setPhotos(newPhotos);
      setEditingCaption(null);
      setCaptionValue("");
    } catch (err) {
      console.error("Caption save error:", err);
      setError(err instanceof Error ? err.message : "Failed to save caption");
    } finally {
      setIsSavingCaption(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Photo Grid with Management */}
      {sortedPhotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sortedPhotos.map((photo) => (
            <div
              key={photo.url}
              className="relative group aspect-square rounded-lg overflow-hidden bg-muted"
            >
              <img
                src={photo.url}
                alt={photo.caption || ""}
                className="w-full h-full object-cover"
              />

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => handleStartEditCaption(photo)}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  aria-label={t("photoManager.editCaption")}
                >
                  <Pencil className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => setDeletePhotoUrl(photo.url)}
                  className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
                  aria-label={t("photoManager.delete")}
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Caption display */}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                  <p className="text-xs text-white truncate">{photo.caption}</p>
                </div>
              )}

              {/* Caption editing */}
              {editingCaption === photo.url && (
                <div
                  className="absolute inset-0 bg-black/80 p-3 flex flex-col justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    placeholder={t("photoManager.captionPlaceholder")}
                    className="text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingCaption(null)}
                      disabled={isSavingCaption}
                      className="text-white hover:bg-white/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveCaption}
                      disabled={isSavingCaption}
                      className="bg-white/20 hover:bg-white/30"
                    >
                      {isSavingCaption ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Photos Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsUploadOpen(true)}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        {t("addOfficialPhotos")}
      </Button>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={handleCloseUpload}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addOfficialPhotos")}</DialogTitle>
            <DialogDescription>
              {t("photoManager.uploadDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("photoManager.clickToSelect")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("photoManager.fileTypes")}
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

            {pendingPhotos.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {t("photoManager.readyToUpload", { count: pendingPhotos.length })}
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
                        placeholder={t("photoManager.captionPlaceholder")}
                        value={photo.caption}
                        onChange={(e) => handleCaptionChange(index, e.target.value)}
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
            <Button variant="outline" onClick={handleCloseUpload} disabled={isUploading}>
              {t("photoManager.cancel")}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={pendingPhotos.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("photoManager.uploading")}
                </>
              ) : (
                t("photoManager.upload", { count: pendingPhotos.length })
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePhotoUrl} onOpenChange={() => setDeletePhotoUrl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photoManager.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("photoManager.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("photoManager.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePhoto}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("photoManager.confirmDelete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
