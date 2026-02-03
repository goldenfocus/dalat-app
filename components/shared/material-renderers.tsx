"use client";

import { useState, useRef, useEffect } from "react";
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio-metadata";

// Re-export formatDuration for convenience
export { formatDuration };

// Icon map for material/moment content types
export const CONTENT_TYPE_ICONS = {
  youtube: Youtube,
  pdf: FileText,
  audio: Music,
  video: Video,
  image: ImageIcon,
  document: File,
  photo: ImageIcon, // Alias for moments
  text: FileText, // For text-only moments
} as const;

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * YouTube embed component
 */
export interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  className?: string;
}

export function YouTubeEmbed({ videoId, title, className }: YouTubeEmbedProps) {
  return (
    <div className={cn("aspect-video rounded-lg overflow-hidden bg-muted", className)}>
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
 * Audio player component with rich metadata display and background playback support
 * Uses Media Session API for lock screen controls and background audio on mobile
 */
export interface AudioPlayerProps {
  url: string;
  filename?: string;
  title?: string;
  artist?: string;
  album?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  genre?: string;
  className?: string;
  compact?: boolean; // For smaller display in cards/grids
}

export function AudioPlayer({
  url,
  filename,
  title,
  artist,
  album,
  thumbnailUrl,
  durationSeconds,
  className,
  compact = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const displayTitle = title || filename || "Audio";
  const hasMetadata = artist || album || thumbnailUrl;

  // Set up Media Session API for background playback and lock screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const audio = audioRef.current;
    if (!audio) return;

    // Update Media Session metadata when component mounts or props change
    const updateMediaSession = () => {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle,
        artist: artist || "Unknown Artist",
        album: album || "Unknown Album",
        artwork: thumbnailUrl
          ? [
              { src: thumbnailUrl, sizes: "96x96", type: "image/jpeg" },
              { src: thumbnailUrl, sizes: "128x128", type: "image/jpeg" },
              { src: thumbnailUrl, sizes: "192x192", type: "image/jpeg" },
              { src: thumbnailUrl, sizes: "256x256", type: "image/jpeg" },
              { src: thumbnailUrl, sizes: "384x384", type: "image/jpeg" },
              { src: thumbnailUrl, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });
    };

    // Set up action handlers for lock screen controls
    const setupActionHandlers = () => {
      navigator.mediaSession.setActionHandler("play", () => {
        audio.play();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        audio.pause();
      });

      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        audio.currentTime = Math.max(audio.currentTime - (details.seekOffset || 10), 0);
      });

      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        audio.currentTime = Math.min(
          audio.currentTime + (details.seekOffset || 10),
          audio.duration || Infinity
        );
      });

      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
        }
      });
    };

    // Update position state periodically for lock screen progress bar
    const updatePositionState = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch {
          // Some browsers don't support setPositionState
        }
      }
    };

    // Track if user intentionally paused
    let userPaused = false;

    // Event listeners
    const handlePlay = () => {
      userPaused = false;
      updateMediaSession();
      setupActionHandlers();
      navigator.mediaSession.playbackState = "playing";
    };

    const handlePause = () => {
      navigator.mediaSession.playbackState = "paused";
      // If page is visible, user intentionally paused
      if (document.visibilityState === "visible") {
        userPaused = true;
      }
    };

    const handleTimeUpdate = () => {
      updatePositionState();
    };

    const handleLoadedMetadata = () => {
      updatePositionState();
    };

    // Handle visibility change (screen lock/unlock)
    // iOS pauses audio when screen locks - we try to resume it
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !audio.paused && !audio.ended) {
        // Page became hidden while playing - iOS may pause it
        // Try to keep playing by re-triggering play
        audio.play().catch(() => {});
      } else if (document.visibilityState === "visible" && !userPaused && audio.paused && !audio.ended) {
        // Page became visible and audio was paused by system (not user)
        // Resume playback
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Clear action handlers on unmount
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("seekto", null);
      }
    };
  }, [displayTitle, artist, album, thumbnailUrl]);

  if (compact) {
    return (
      <div className={cn("border rounded-lg bg-card overflow-hidden", className)}>
        <div className="flex items-center gap-3 p-3">
          {/* Album art thumbnail or icon */}
          <div className="w-10 h-10 flex-shrink-0 rounded bg-primary/10 flex items-center justify-center overflow-hidden">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={album || displayTitle || "Album art"}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{displayTitle}</p>
            {artist && <p className="text-xs text-muted-foreground truncate">{artist}</p>}
          </div>
        </div>
        <audio ref={audioRef} controls playsInline preload="auto" className="w-full h-8 px-3 pb-2">
          <source src={url} type="audio/mpeg" />
          <source src={url} />
        </audio>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden", className)}>
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
          {displayTitle && (
            <p className="font-medium truncate text-base">{displayTitle}</p>
          )}
          {artist && (
            <p className="text-sm text-muted-foreground truncate">{artist}</p>
          )}
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
        <audio
          ref={audioRef}
          controls
          playsInline
          preload="auto"
          className="w-full h-10"
        >
          <source src={url} type="audio/mpeg" />
          <source src={url} />
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  );
}

/**
 * Video player component (for direct video files, not Cloudflare Stream)
 */
export interface VideoPlayerProps {
  url: string;
  filename?: string;
  className?: string;
}

export function VideoPlayer({ url, filename, className }: VideoPlayerProps) {
  return (
    <div className={cn("rounded-lg overflow-hidden bg-muted", className)}>
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
export interface PDFPreviewProps {
  url: string;
  filename?: string;
  fileSize?: number;
  className?: string;
  compact?: boolean;
}

export function PDFPreview({ url, filename, fileSize, className, compact = false }: PDFPreviewProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Handle escape key to close viewer
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsViewerOpen(false);
    }
  };

  return (
    <>
      <div className={cn("border rounded-lg overflow-hidden bg-card", className)}>
        <div className={cn("flex items-center gap-3", compact ? "p-3" : "p-4")}>
          <div className={cn(
            "rounded bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0",
            compact ? "w-10 h-10" : "w-12 h-12"
          )}>
            <FileText className={cn("text-red-600 dark:text-red-400", compact ? "w-5 h-5" : "w-6 h-6")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("font-medium truncate", compact && "text-sm")}>{filename || "Document.pdf"}</p>
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
              {!compact && <span className="hidden sm:inline">Preview</span>}
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
export interface ImagePreviewProps {
  url: string;
  title?: string;
  className?: string;
}

export function ImagePreview({ url, title, className }: ImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "block w-full rounded-lg overflow-hidden border bg-muted hover:opacity-90 transition-opacity",
          className
        )}
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
export interface DocumentLinkProps {
  url: string;
  filename?: string;
  fileSize?: number;
  className?: string;
  compact?: boolean;
}

export function DocumentLink({ url, filename, fileSize, className, compact = false }: DocumentLinkProps) {
  return (
    <a
      href={url}
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 border rounded-lg bg-card hover:bg-accent transition-colors",
        compact ? "p-3" : "p-4",
        className
      )}
    >
      <div className={cn(
        "rounded bg-muted flex items-center justify-center flex-shrink-0",
        compact ? "w-10 h-10" : "w-12 h-12"
      )}>
        <File className={cn("text-muted-foreground", compact ? "w-5 h-5" : "w-6 h-6")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium truncate", compact && "text-sm")}>{filename || "Document"}</p>
        {fileSize && (
          <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
        )}
      </div>
      <Download className="w-5 h-5 text-muted-foreground flex-shrink-0" />
    </a>
  );
}

/**
 * Extract YouTube video ID from various URL formats
 * Supports: watch, shorts, live, embed, and short youtu.be links
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/shorts\/([^&\s?]+)/,
    /youtube\.com\/live\/([^&\s?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Get YouTube thumbnail URL from video ID
 */
export function getYouTubeThumbnail(videoId: string, quality: "default" | "medium" | "high" | "maxres" = "medium"): string {
  const qualityMap = {
    default: "default",
    medium: "mqdefault",
    high: "hqdefault",
    maxres: "maxresdefault",
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}
