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
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventMaterial, MaterialType } from "@/lib/types";
import { formatDuration } from "@/lib/audio-metadata";

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
 * Audio player component with rich metadata display
 */
interface AudioPlayerProps {
  url: string;
  filename?: string;
  title?: string;
  artist?: string;
  album?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  genre?: string;
}

function AudioPlayer({
  url,
  filename,
  title,
  artist,
  album,
  thumbnailUrl,
  durationSeconds,
}: AudioPlayerProps) {
  const displayTitle = title || filename;
  const hasMetadata = artist || album || thumbnailUrl;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {/* Album art thumbnail or icon */}
        <div className={cn(
          "flex-shrink-0 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center",
          hasMetadata ? "w-20 h-20" : "w-12 h-12 rounded-full"
        )}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={album || displayTitle || "Album art"}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music className={cn("text-primary", hasMetadata ? "w-8 h-8" : "w-6 h-6")} />
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          {/* Title (or filename fallback) */}
          {displayTitle && (
            <p className="font-medium truncate text-base">{displayTitle}</p>
          )}

          {/* Artist */}
          {artist && (
            <p className="text-sm text-muted-foreground truncate">{artist}</p>
          )}

          {/* Album and duration row */}
          {(album || durationSeconds) && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              {album && <span className="truncate">{album}</span>}
              {album && durationSeconds && <span>•</span>}
              {durationSeconds && <span>{formatDuration(durationSeconds)}</span>}
            </p>
          )}
        </div>
      </div>

      {/* Audio controls */}
      <div className="px-4 pb-4">
        <audio controls className="w-full h-10">
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
 * PDF preview with fullscreen viewer for mobile
 * Opens in a fullscreen modal with proper touch support
 */
function PDFPreview({ url, filename, fileSize }: { url: string; filename?: string; fileSize?: number }) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Handle escape key to close viewer
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsViewerOpen(false);
    }
  };

  return (
    <>
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
              onClick={() => setIsViewerOpen(true)}
              className="gap-1"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={url} download={filename} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen PDF Viewer Modal */}
      {isViewerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={filename || "PDF Viewer"}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-black/80 backdrop-blur-sm border-b border-white/10">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-white text-sm font-medium truncate">
                {filename || "Document.pdf"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-white hover:bg-white/10"
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Open</span>
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-white hover:bg-white/10"
              >
                <a href={url} download={filename}>
                  <Download className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsViewerOpen(false)}
                className="text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* PDF Content - using Google Docs Viewer for reliable mobile support */}
          <div className="flex-1 bg-neutral-900">
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
              className="w-full h-full border-0"
              title={filename || "PDF Preview"}
              allow="fullscreen"
              style={{ minHeight: "calc(100vh - 60px)" }}
            />
          </div>
        </div>
      )}
    </>
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
        <AudioPlayer
          url={material.file_url}
          filename={material.original_filename || undefined}
          title={material.title || undefined}
          artist={material.artist || undefined}
          album={material.album || undefined}
          thumbnailUrl={material.thumbnail_url || undefined}
          durationSeconds={material.duration_seconds || undefined}
          genre={material.genre || undefined}
        />
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
  const t = useTranslations("events");
  const [isExpanded, setIsExpanded] = useState(false);

  if (!materials || materials.length === 0) return null;

  // Count by type
  const typeCounts = materials.reduce((acc, m) => {
    acc[m.material_type] = (acc[m.material_type] || 0) + 1;
    return acc;
  }, {} as Record<MaterialType, number>);

  return (
    <div className={cn("border rounded-lg", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-4 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <p className="font-medium">{t("materials")}</p>
          <div className="flex -space-x-1">
            {Object.keys(typeCounts).map((type) => {
              const Icon = TYPE_ICONS[type as MaterialType];
              return (
                <div
                  key={type}
                  className="w-6 h-6 rounded-full bg-muted border border-background flex items-center justify-center"
                >
                  <Icon className="w-3 h-3 text-muted-foreground" />
                </div>
              );
            })}
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
