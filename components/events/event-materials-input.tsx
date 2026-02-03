"use client";

import { useState, useRef, useCallback } from "react";
import {
  FileText,
  Music,
  Video,
  Image as ImageIcon,
  File,
  Youtube,
  X,
  Plus,
  Loader2,
  GripVertical,
  ExternalLink,
  Upload,
  Link as LinkIcon,
  Pencil,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EventMaterial, DraftMaterial, MaterialType } from "@/lib/types";
import {
  extractAudioMetadata,
  albumArtToBlob,
  albumArtToDataUrl,
  isAudioFile,
  formatDuration,
} from "@/lib/audio-metadata";

interface EventMaterialsInputProps {
  // For editing existing events
  eventId?: string;
  initialMaterials?: EventMaterial[];
  onChange?: (materials: EventMaterial[]) => void;
  // For new events (draft mode)
  draftMaterials?: DraftMaterial[];
  onDraftChange?: (materials: DraftMaterial[]) => void;
}

// Allowed file types by category
const FILE_TYPE_MAP: Record<string, MaterialType> = {
  // Videos
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  // Audio
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/x-m4a": "audio",
  // Images
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  // Documents
  "application/pdf": "pdf",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
};

const ALLOWED_MIME_TYPES = Object.keys(FILE_TYPE_MAP);
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Icon map for material types
const TYPE_ICONS: Record<MaterialType, React.ComponentType<{ className?: string }>> = {
  youtube: Youtube,
  pdf: FileText,
  audio: Music,
  video: Video,
  image: ImageIcon,
  document: File,
};

// Type labels - now using translations via hook in component

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/shorts\/([^&\s?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EventMaterialsInput({
  eventId,
  initialMaterials = [],
  onChange,
  draftMaterials = [],
  onDraftChange,
}: EventMaterialsInputProps) {
  const t = useTranslations("eventForm");
  const tc = useTranslations("common");
  const isDraftMode = !eventId;

  // Type labels using translations
  const getTypeLabel = (type: MaterialType) => t(`materialTypes.${type}`);

  // Live mode state
  const [materials, setMaterials] = useState<EventMaterial[]>(initialMaterials);

  // Shared state
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    artist: "",
    album: "",
    genre: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Get display list based on mode
  const displayList = isDraftMode
    ? draftMaterials.map((d) => ({
        id: d.id,
        material_type: d.material_type,
        title: d.title || d.original_filename || (d.youtube_video_id ? "YouTube Video" : "Material"),
        file_url: d.file_url,
        youtube_url: d.youtube_url,
        youtube_video_id: d.youtube_video_id,
        file_size: d.file_size,
        original_filename: d.original_filename,
        // Audio metadata for display
        thumbnail_url: d.thumbnail_url,
        artist: d.artist,
        album: d.album,
        duration_seconds: d.duration_seconds,
      }))
    : materials.map((m) => ({
        id: m.id,
        material_type: m.material_type,
        title: m.title || m.original_filename || (m.youtube_video_id ? "YouTube Video" : "Material"),
        file_url: m.file_url,
        youtube_url: m.youtube_url,
        youtube_video_id: m.youtube_video_id,
        file_size: m.file_size,
        original_filename: m.original_filename,
        // Audio metadata for display
        thumbnail_url: m.thumbnail_url,
        artist: m.artist,
        album: m.album,
        duration_seconds: m.duration_seconds,
      }));

  const hasMaterials = displayList.length > 0;

  // Upload file to storage
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!eventId) return null;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-materials")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("event-materials")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.error("File upload error:", err);
      setError(t("materialErrors.uploadFailed"));
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [eventId]);

  // Process a single file and return draft material or uploaded material
  const processFile = useCallback(async (
    file: File,
    sortOrderOffset: number
  ): Promise<{ draft?: DraftMaterial; material?: EventMaterial } | null> => {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      console.warn(`Skipping unsupported file type: ${file.type}`);
      return null;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`Skipping file too large: ${file.name}`);
      return null;
    }

    const materialType = FILE_TYPE_MAP[file.type] || "document";

    // Extract audio metadata if it's an audio file
    let audioMetadata: {
      title: string | null;
      artist: string | null;
      album: string | null;
      durationSeconds: number | null;
      trackNumber: string | null;
      releaseYear: number | null;
      genre: string | null;
      thumbnailUrl: string | null;
      thumbnailBlob: Blob | null;
    } = {
      title: null,
      artist: null,
      album: null,
      durationSeconds: null,
      trackNumber: null,
      releaseYear: null,
      genre: null,
      thumbnailUrl: null,
      thumbnailBlob: null,
    };

    if (isAudioFile(file)) {
      try {
        const metadata = await extractAudioMetadata(file);
        audioMetadata = {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          durationSeconds: metadata.durationSeconds,
          trackNumber: metadata.trackNumber,
          releaseYear: metadata.releaseYear,
          genre: metadata.genre,
          thumbnailUrl: albumArtToDataUrl(metadata.albumArt),
          thumbnailBlob: albumArtToBlob(metadata.albumArt),
        };
      } catch (err) {
        console.error("Failed to extract audio metadata:", err);
      }
    }

    if (isDraftMode) {
      const previewUrl = URL.createObjectURL(file);
      const draft: DraftMaterial = {
        id: `draft-${Date.now()}-${sortOrderOffset}`,
        material_type: materialType,
        file_url: previewUrl,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        youtube_url: null,
        youtube_video_id: null,
        title: audioMetadata.title,
        artist: audioMetadata.artist,
        album: audioMetadata.album,
        duration_seconds: audioMetadata.durationSeconds,
        thumbnail_url: audioMetadata.thumbnailUrl,
        track_number: audioMetadata.trackNumber,
        release_year: audioMetadata.releaseYear,
        genre: audioMetadata.genre,
        pending_file: file,
        pending_thumbnail: audioMetadata.thumbnailBlob || undefined,
      };
      return { draft };
    } else {
      const url = await uploadFile(file);
      if (!url) return null;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Upload album art thumbnail if available
      let thumbnailUrl: string | null = null;
      if (audioMetadata.thumbnailBlob && eventId) {
        try {
          const ext = audioMetadata.thumbnailBlob.type.split("/")[1] || "jpg";
          const thumbFileName = `${eventId}/thumb-${Date.now()}-${sortOrderOffset}.${ext}`;

          const { error: thumbUploadError } = await supabase.storage
            .from("event-materials")
            .upload(thumbFileName, audioMetadata.thumbnailBlob, {
              cacheControl: "3600",
              upsert: true,
            });

          if (!thumbUploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from("event-materials")
              .getPublicUrl(thumbFileName);
            thumbnailUrl = publicUrl;
          }
        } catch (err) {
          console.error("Failed to upload album art:", err);
        }
      }

      const { data, error: insertError } = await supabase
        .from("event_materials")
        .insert({
          event_id: eventId,
          material_type: materialType,
          file_url: url,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type,
          sort_order: materials.length + sortOrderOffset,
          created_by: user?.id,
          title: audioMetadata.title,
          artist: audioMetadata.artist,
          album: audioMetadata.album,
          duration_seconds: audioMetadata.durationSeconds,
          thumbnail_url: thumbnailUrl,
          track_number: audioMetadata.trackNumber,
          release_year: audioMetadata.releaseYear,
          genre: audioMetadata.genre,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to save material:", insertError);
        return null;
      }

      return { material: data };
    }
  }, [isDraftMode, eventId, materials.length, uploadFile]);

  // Handle file selection (supports multiple files)
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    setIsUploading(true);

    const fileArray = Array.from(files);
    const total = fileArray.length;

    // Show progress for multi-file upload
    if (total > 1) {
      setUploadProgress({ current: 0, total });
    }

    const newDrafts: DraftMaterial[] = [];
    const newMaterials: EventMaterial[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      if (total > 1) {
        setUploadProgress({ current: i + 1, total });
      }

      const result = await processFile(file, i);
      if (result?.draft) {
        newDrafts.push(result.draft);
      } else if (result?.material) {
        newMaterials.push(result.material);
      }
    }

    // Update state with all processed files
    if (isDraftMode && newDrafts.length > 0) {
      const updated = [...draftMaterials, ...newDrafts];
      onDraftChange?.(updated);
    } else if (newMaterials.length > 0) {
      const updated = [...materials, ...newMaterials];
      setMaterials(updated);
      onChange?.(updated);
    }

    setIsAdding(false);
    setIsUploading(false);
    setUploadProgress(null);
  }, [isDraftMode, draftMaterials, materials, onDraftChange, onChange, processFile]);

  // Handle YouTube URL
  const handleAddYouTube = useCallback(async () => {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      setError(t("materialErrors.invalidYoutubeUrl"));
      return;
    }

    setError(null);

    if (isDraftMode) {
      const draft: DraftMaterial = {
        id: `draft-${Date.now()}`,
        material_type: "youtube",
        file_url: null,
        original_filename: null,
        file_size: null,
        mime_type: null,
        youtube_url: youtubeUrl,
        youtube_video_id: videoId,
        title: null,
        // Audio metadata fields (null for YouTube)
        artist: null,
        album: null,
        duration_seconds: null,
        thumbnail_url: null,
        track_number: null,
        release_year: null,
        genre: null,
      };

      const updated = [...draftMaterials, draft];
      onDraftChange?.(updated);
      setYoutubeUrl("");
      setIsAdding(false);
    } else {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error: insertError } = await supabase
        .from("event_materials")
        .insert({
          event_id: eventId,
          material_type: "youtube",
          youtube_url: youtubeUrl,
          youtube_video_id: videoId,
          sort_order: materials.length,
          created_by: user?.id,
        })
        .select()
        .single();

      if (insertError) {
        setError(t("materialErrors.saveYoutubeFailed"));
        return;
      }

      const updated = [...materials, data];
      setMaterials(updated);
      onChange?.(updated);
      setYoutubeUrl("");
      setIsAdding(false);
    }
  }, [youtubeUrl, isDraftMode, draftMaterials, materials, eventId, onDraftChange, onChange]);

  // Handle remove material
  const handleRemove = useCallback(async (id: string) => {
    if (isDraftMode) {
      const updated = draftMaterials.filter((m) => m.id !== id);
      onDraftChange?.(updated);
    } else {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("event_materials")
        .delete()
        .eq("id", id);

      if (deleteError) {
        setError(t("materialErrors.removeFailedMaterial"));
        return;
      }

      const updated = materials.filter((m) => m.id !== id);
      setMaterials(updated);
      onChange?.(updated);
    }
  }, [isDraftMode, draftMaterials, materials, onDraftChange, onChange]);

  // Start editing a material
  const handleStartEdit = useCallback((id: string) => {
    if (isDraftMode) {
      const draft = draftMaterials.find((m) => m.id === id);
      if (draft) {
        setEditForm({
          title: draft.title || "",
          artist: draft.artist || "",
          album: draft.album || "",
          genre: draft.genre || "",
          description: "",
        });
        setEditingId(id);
      }
    } else {
      const material = materials.find((m) => m.id === id);
      if (material) {
        setEditForm({
          title: material.title || "",
          artist: material.artist || "",
          album: material.album || "",
          genre: material.genre || "",
          description: material.description || "",
        });
        setEditingId(id);
      }
    }
  }, [isDraftMode, draftMaterials, materials]);

  // Save edited material
  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;

    setIsSaving(true);
    setError(null);

    if (isDraftMode) {
      const updated = draftMaterials.map((m) =>
        m.id === editingId
          ? {
              ...m,
              title: editForm.title || null,
              artist: editForm.artist || null,
              album: editForm.album || null,
              genre: editForm.genre || null,
            }
          : m
      );
      onDraftChange?.(updated);
      setEditingId(null);
      setIsSaving(false);
    } else {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("event_materials")
        .update({
          title: editForm.title || null,
          artist: editForm.artist || null,
          album: editForm.album || null,
          genre: editForm.genre || null,
          description: editForm.description || null,
        })
        .eq("id", editingId);

      if (updateError) {
        setError(t("materialErrors.saveFailed"));
        setIsSaving(false);
        return;
      }

      const updated = materials.map((m) =>
        m.id === editingId
          ? {
              ...m,
              title: editForm.title || null,
              artist: editForm.artist || null,
              album: editForm.album || null,
              genre: editForm.genre || null,
              description: editForm.description || null,
            }
          : m
      );
      setMaterials(updated);
      onChange?.(updated);
      setEditingId(null);
      setIsSaving(false);
    }
  }, [editingId, editForm, isDraftMode, draftMaterials, materials, onDraftChange, onChange]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({ title: "", artist: "", album: "", genre: "", description: "" });
  }, []);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <Label className="text-base">
        {t("materials")} {hasMaterials && `(${displayList.length})`}
      </Label>
      <p className="text-xs text-muted-foreground -mt-2">
        {t("materialsDescription")}
      </p>

      {/* Existing materials list */}
      {hasMaterials && (
        <div className="space-y-2">
          {displayList.map((item) => {
            const Icon = TYPE_ICONS[item.material_type];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-card"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />

                {/* Type icon / Thumbnail */}
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.material_type === "youtube" && item.youtube_video_id ? (
                    <img
                      src={`https://img.youtube.com/vi/${item.youtube_video_id}/default.jpg`}
                      alt="YouTube thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : item.material_type === "image" && item.file_url ? (
                    <img
                      src={item.file_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : item.material_type === "audio" && item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">
                    {item.material_type === "audio" && item.artist
                      ? `${item.artist} - ${item.title}`
                      : item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.material_type === "audio" && item.album ? (
                      <>
                        {item.album}
                        {item.duration_seconds && ` • ${formatDuration(item.duration_seconds)}`}
                      </>
                    ) : (
                      <>
                        {getTypeLabel(item.material_type)}
                        {item.file_size && ` • ${formatFileSize(item.file_size)}`}
                      </>
                    )}
                  </p>
                </div>

                {/* External link */}
                {(item.file_url || item.youtube_url) && (
                  <a
                    href={item.youtube_url || item.file_url || ""}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Edit button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartEdit(item.id)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </Button>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(item.id)}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit material dialog */}
      {editingId && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{tc("edit")} {t("material")}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelEdit}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-title" className="text-xs text-muted-foreground">
                {tc("title")}
              </Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={tc("title")}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-artist" className="text-xs text-muted-foreground">
                {t("materialFields.artist")}
              </Label>
              <Input
                id="edit-artist"
                value={editForm.artist}
                onChange={(e) => setEditForm((prev) => ({ ...prev, artist: e.target.value }))}
                placeholder={t("materialFields.artist")}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-album" className="text-xs text-muted-foreground">
                {t("materialFields.album")}
              </Label>
              <Input
                id="edit-album"
                value={editForm.album}
                onChange={(e) => setEditForm((prev) => ({ ...prev, album: e.target.value }))}
                placeholder={t("materialFields.album")}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-genre" className="text-xs text-muted-foreground">
                {t("materialFields.genre")}
              </Label>
              <Input
                id="edit-genre"
                value={editForm.genre}
                onChange={(e) => setEditForm((prev) => ({ ...prev, genre: e.target.value }))}
                placeholder={t("materialFields.genre")}
                className="mt-1"
              />
            </div>

            {!isDraftMode && (
              <div>
                <Label htmlFor="edit-description" className="text-xs text-muted-foreground">
                  {tc("description")}
                </Label>
                <Input
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={tc("description")}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveEdit}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {tc("save")}
            </Button>
          </div>
        </div>
      )}

      {/* Add material button */}
      {!isAdding && !editingId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("addMaterial")}
        </Button>
      )}

      {/* Add material dialog */}
      {isAdding && !editingId && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setAddMode("file")}
              className={cn(
                "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2",
                addMode === "file"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Upload className="w-4 h-4" />
              {t("uploadFile")}
            </button>
            <button
              type="button"
              onClick={() => setAddMode("youtube")}
              className={cn(
                "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2",
                addMode === "youtube"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Youtube className="w-4 h-4" />
              {t("materialTypes.youtube")}
            </button>
          </div>

          {/* File upload */}
          {addMode === "file" && (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  {uploadProgress && (
                    <p className="text-sm text-muted-foreground">
                      Uploading {uploadProgress.current} of {uploadProgress.total}...
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {t("dropFileHere")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("supportedFileTypes")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* YouTube URL input */}
          {addMode === "youtube" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t("pasteYoutubeUrl")}
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleAddYouTube}
                  disabled={!youtubeUrl.trim()}
                >
                  {tc("add")}
                </Button>
              </div>

              {/* YouTube preview */}
              {youtubeUrl && extractYouTubeId(youtubeUrl) && (
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={`https://img.youtube.com/vi/${extractYouTubeId(youtubeUrl)}/hqdefault.jpg`}
                    alt="YouTube preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(",")}
            multiple
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setAddMode("file");
                setYoutubeUrl("");
                setError(null);
              }}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to create materials after event is created
 */
export async function createMaterialsForEvent(
  eventId: string,
  draftMaterials: DraftMaterial[]
): Promise<void> {
  if (draftMaterials.length === 0) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  for (let i = 0; i < draftMaterials.length; i++) {
    const draft = draftMaterials[i];
    let fileUrl: string | null = draft.file_url;
    let thumbnailUrl: string | null = null;

    // Upload file if we have a pending file
    if (draft.pending_file) {
      const ext = draft.pending_file.name.split(".").pop()?.toLowerCase() || "";
      const fileName = `${eventId}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-materials")
        .upload(fileName, draft.pending_file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from("event-materials")
          .getPublicUrl(fileName);
        fileUrl = publicUrl;
      } else {
        // Upload failed - skip this material
        console.error("Material upload failed:", uploadError);
        continue;
      }
    } else if (fileUrl?.startsWith("blob:")) {
      // Clear any blob URLs that weren't meant to be uploaded
      fileUrl = null;
    }

    // Upload album art thumbnail if we have one
    if (draft.pending_thumbnail) {
      try {
        const thumbExt = draft.pending_thumbnail.type.split("/")[1] || "jpg";
        const thumbFileName = `${eventId}/thumb-${Date.now()}-${i}.${thumbExt}`;

        const { error: thumbUploadError } = await supabase.storage
          .from("event-materials")
          .upload(thumbFileName, draft.pending_thumbnail, {
            cacheControl: "3600",
            upsert: true,
          });

        if (!thumbUploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("event-materials")
            .getPublicUrl(thumbFileName);
          thumbnailUrl = publicUrl;
        }
      } catch (err) {
        console.error("Failed to upload album art thumbnail:", err);
        // Continue without thumbnail
      }
    }

    // Insert material record with audio metadata
    await supabase.from("event_materials").insert({
      event_id: eventId,
      material_type: draft.material_type,
      file_url: fileUrl,
      original_filename: draft.original_filename,
      file_size: draft.file_size,
      mime_type: draft.mime_type,
      youtube_url: draft.youtube_url,
      youtube_video_id: draft.youtube_video_id,
      title: draft.title,
      // Audio metadata fields
      artist: draft.artist,
      album: draft.album,
      duration_seconds: draft.duration_seconds,
      thumbnail_url: thumbnailUrl,
      track_number: draft.track_number,
      release_year: draft.release_year,
      genre: draft.genre,
      sort_order: i,
      created_by: user.id,
    });
  }
}
