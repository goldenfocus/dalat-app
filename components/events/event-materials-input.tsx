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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EventMaterial, DraftMaterial, MaterialType } from "@/lib/types";

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

// Type labels
const TYPE_LABELS: Record<MaterialType, string> = {
  youtube: "YouTube",
  pdf: "PDF",
  audio: "Audio",
  video: "Video",
  image: "Image",
  document: "Document",
};

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
  const isDraftMode = !eventId;

  // Live mode state
  const [materials, setMaterials] = useState<EventMaterial[]>(initialMaterials);

  // Shared state
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setError("Failed to upload file");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [eventId]);

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Unsupported file type. Please upload images, videos, audio, PDFs, or documents.");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be under 100MB");
      return;
    }

    setError(null);
    const materialType = FILE_TYPE_MAP[file.type] || "document";

    if (isDraftMode) {
      // Draft mode: create preview URL, store file for later upload
      const previewUrl = URL.createObjectURL(file);
      const draft: DraftMaterial = {
        id: `draft-${Date.now()}`,
        material_type: materialType,
        file_url: previewUrl,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        youtube_url: null,
        youtube_video_id: null,
        title: null,
        pending_file: file,
      };

      const updated = [...draftMaterials, draft];
      onDraftChange?.(updated);
      setIsAdding(false);
    } else {
      // Live mode: upload immediately
      const url = await uploadFile(file);
      if (url) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const { data, error: insertError } = await supabase
          .from("event_materials")
          .insert({
            event_id: eventId,
            material_type: materialType,
            file_url: url,
            original_filename: file.name,
            file_size: file.size,
            mime_type: file.type,
            sort_order: materials.length,
            created_by: user?.id,
          })
          .select()
          .single();

        if (insertError) {
          setError("Failed to save material");
          return;
        }

        const updated = [...materials, data];
        setMaterials(updated);
        onChange?.(updated);
        setIsAdding(false);
      }
    }
  }, [isDraftMode, draftMaterials, materials, eventId, onDraftChange, onChange, uploadFile]);

  // Handle YouTube URL
  const handleAddYouTube = useCallback(async () => {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      setError("Invalid YouTube URL. Please enter a valid YouTube video link.");
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
        setError("Failed to save YouTube video");
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
        setError("Failed to remove material");
        return;
      }

      const updated = materials.filter((m) => m.id !== id);
      setMaterials(updated);
      onChange?.(updated);
    }
  }, [isDraftMode, draftMaterials, materials, onDraftChange, onChange]);

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
        Materials {hasMaterials && `(${displayList.length})`}
      </Label>
      <p className="text-xs text-muted-foreground -mt-2">
        Add PDFs, videos, audio, or images related to this event
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

                {/* Type icon */}
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  {item.material_type === "youtube" && item.youtube_video_id ? (
                    <img
                      src={`https://img.youtube.com/vi/${item.youtube_video_id}/default.jpg`}
                      alt="YouTube thumbnail"
                      className="w-full h-full object-cover rounded"
                    />
                  ) : item.material_type === "image" && item.file_url ? (
                    <img
                      src={item.file_url}
                      alt={item.title}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[item.material_type]}
                    {item.file_size && ` • ${formatFileSize(item.file_size)}`}
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

      {/* Add material button */}
      {!isAdding && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add material
        </Button>
      )}

      {/* Add material dialog */}
      {isAdding && (
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
              Upload file
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
              YouTube
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
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, images, videos, audio, documents (max 100MB)
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
                    placeholder="Paste YouTube URL..."
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
                  Add
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
              Cancel
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

    // Insert material record
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
      sort_order: i,
      created_by: user.id,
    });
  }
}
