"use client";

import { useState } from "react";
import {
  FileText,
  Music,
  Video,
  Image as ImageIcon,
  File,
  Youtube,
  Download,
  ExternalLink,
  Play,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventMaterial, MaterialType } from "@/lib/types";

interface EventMaterialsProps {
  materials: EventMaterial[];
  className?: string;
}

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
  youtube: "YouTube Video",
  pdf: "PDF Document",
  audio: "Audio",
  video: "Video",
  image: "Image",
  document: "Document",
};

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * YouTube embed component
 */
function YouTubeEmbed({ videoId, title }: { videoId: string; title?: string }) {
  return (
    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title || "YouTube video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

/**
 * Audio player component
 */
function AudioPlayer({ url, filename }: { url: string; filename?: string }) {
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-card">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Music className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {filename && <p className="text-sm font-medium truncate">{filename}</p>}
        <audio controls className="w-full h-8 mt-1">
          <source src={url} />
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  );
}

/**
 * Video player component
 */
function VideoPlayer({ url, filename }: { url: string; filename?: string }) {
  return (
    <div className="rounded-lg overflow-hidden bg-muted">
      {filename && (
        <p className="text-sm font-medium p-3 border-b">{filename}</p>
      )}
      <video controls className="w-full aspect-video">
        <source src={url} />
        Your browser does not support video playback.
      </video>
    </div>
  );
}

/**
 * PDF preview with download option
 */
function PDFPreview({ url, filename, fileSize }: { url: string; filename?: string; fileSize?: number }) {
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="w-12 h-12 rounded bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{filename || "Document.pdf"}</p>
          <p className="text-xs text-muted-foreground">
            PDF {fileSize && `• ${formatFileSize(fileSize)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmbed(!showEmbed)}
          >
            {showEmbed ? <ChevronUp className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {showEmbed ? "Hide" : "Preview"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} download={filename} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>

      {showEmbed && (
        <div className="border-t">
          <iframe
            src={`${url}#toolbar=0&navpanes=0`}
            className="w-full h-[500px]"
            title={filename || "PDF Preview"}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Image with lightbox
 */
function ImagePreview({ url, title }: { url: string; title?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block w-full rounded-lg overflow-hidden border bg-muted hover:opacity-90 transition-opacity"
      >
        <img
          src={url}
          alt={title || "Image"}
          className="w-full h-auto max-h-64 object-contain"
        />
        {title && (
          <p className="p-2 text-sm text-center text-muted-foreground border-t">
            {title}
          </p>
        )}
      </button>

      {/* Lightbox */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-white hover:text-white/80"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={url}
            alt={title || "Image"}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

/**
 * Generic document download link
 */
function DocumentLink({ url, filename, fileSize }: { url: string; filename?: string; fileSize?: number }) {
  const Icon = File;

  return (
    <a
      href={url}
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-accent transition-colors"
    >
      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{filename || "Document"}</p>
        {fileSize && (
          <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
        )}
      </div>
      <Download className="w-5 h-5 text-muted-foreground flex-shrink-0" />
    </a>
  );
}

/**
 * Render a single material based on its type
 */
function MaterialItem({ material }: { material: EventMaterial }) {
  const displayTitle = material.title || material.original_filename;

  switch (material.material_type) {
    case "youtube":
      return material.youtube_video_id ? (
        <YouTubeEmbed videoId={material.youtube_video_id} title={displayTitle || undefined} />
      ) : null;

    case "audio":
      return material.file_url ? (
        <AudioPlayer url={material.file_url} filename={displayTitle || undefined} />
      ) : null;

    case "video":
      return material.file_url ? (
        <VideoPlayer url={material.file_url} filename={displayTitle || undefined} />
      ) : null;

    case "pdf":
      return material.file_url ? (
        <PDFPreview
          url={material.file_url}
          filename={displayTitle || undefined}
          fileSize={material.file_size || undefined}
        />
      ) : null;

    case "image":
      return material.file_url ? (
        <ImagePreview url={material.file_url} title={displayTitle || undefined} />
      ) : null;

    case "document":
      return material.file_url ? (
        <DocumentLink
          url={material.file_url}
          filename={displayTitle || undefined}
          fileSize={material.file_size || undefined}
        />
      ) : null;

    default:
      return null;
  }
}

/**
 * Display event materials with appropriate renderers for each type
 */
export function EventMaterials({ materials, className }: EventMaterialsProps) {
  if (!materials || materials.length === 0) return null;

  // Sort by sort_order
  const sortedMaterials = [...materials].sort((a, b) => a.sort_order - b.sort_order);

  // Group materials by type for better organization
  const youtubeVideos = sortedMaterials.filter((m) => m.material_type === "youtube");
  const otherMaterials = sortedMaterials.filter((m) => m.material_type !== "youtube");

  return (
    <div className={cn("space-y-6", className)}>
      {/* YouTube videos get prominent display */}
      {youtubeVideos.length > 0 && (
        <div className="space-y-4">
          {youtubeVideos.map((material) => (
            <MaterialItem key={material.id} material={material} />
          ))}
        </div>
      )}

      {/* Other materials in a grid/list */}
      {otherMaterials.length > 0 && (
        <div className="space-y-4">
          {otherMaterials.map((material) => (
            <MaterialItem key={material.id} material={material} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for showing materials count with expand
 */
export function EventMaterialsSummary({
  materials,
  className,
}: EventMaterialsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!materials || materials.length === 0) return null;

  // Count by type
  const typeCounts = materials.reduce((acc, m) => {
    acc[m.material_type] = (acc[m.material_type] || 0) + 1;
    return acc;
  }, {} as Record<MaterialType, number>);

  const typeLabels = Object.entries(typeCounts)
    .map(([type, count]) => {
      const label = TYPE_LABELS[type as MaterialType];
      return count > 1 ? `${count} ${label}s` : `${count} ${label}`;
    })
    .join(", ");

  return (
    <div className={cn("border rounded-lg", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-4 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {Object.keys(typeCounts).slice(0, 3).map((type) => {
              const Icon = TYPE_ICONS[type as MaterialType];
              return (
                <div
                  key={type}
                  className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
          <div>
            <p className="font-medium">Event Materials</p>
            <p className="text-xs text-muted-foreground">{typeLabels}</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 border-t">
          <EventMaterials materials={materials} />
        </div>
      )}
    </div>
  );
}
