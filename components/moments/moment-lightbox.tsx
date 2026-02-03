"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { MomentVideoPlayer } from "@/components/moments/moment-video-player";
import {
  YouTubeEmbed,
  AudioPlayer,
  PDFPreview,
} from "@/components/shared/material-renderers";
import type { MomentContentType, MomentVideoStatus } from "@/lib/types";

// Minimal moment data needed for lightbox display
export interface LightboxMoment {
  id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url?: string | null;
  text_content: string | null;
  // Video fields
  cf_video_uid?: string | null;
  cf_playback_url?: string | null;
  video_status?: MomentVideoStatus | null;
  // Material fields
  youtube_video_id?: string | null;
  file_url?: string | null;
  original_filename?: string | null;
  title?: string | null;
  artist?: string | null;
  audio_thumbnail_url?: string | null;
  // Event info (for mixed-event lightboxes like search results)
  event_slug?: string | null;
}

interface MomentLightboxProps {
  moments: LightboxMoment[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  eventSlug?: string;
  /** Called when navigating to a different moment */
  onIndexChange?: (index: number) => void;
}

export function MomentLightbox({
  moments,
  initialIndex,
  isOpen,
  onClose,
  eventSlug,
  onIndexChange,
}: MomentLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLandscape, setIsLandscape] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDiff, setTouchDiff] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const moment = moments[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < moments.length - 1;

  // Reset index when modal opens with new initialIndex
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Navigation handlers
  const goToPrev = useCallback(() => {
    if (hasPrev) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [currentIndex, hasPrev, onIndexChange]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [currentIndex, hasNext, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, goToPrev, goToNext]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchDiff(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.touches[0].clientX - touchStart;
    setTouchDiff(diff);
  };

  const handleTouchEnd = () => {
    if (touchStart === null) return;

    // Swipe threshold of 50px
    if (touchDiff > 50 && hasPrev) {
      goToPrev();
    } else if (touchDiff < -50 && hasNext) {
      goToNext();
    }

    setTouchStart(null);
    setTouchDiff(0);
  };

  // Image aspect ratio detection
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setIsLandscape(img.naturalWidth > img.naturalHeight);
    }
  }, []);

  // Open full page for SEO/sharing
  // Use moment's event_slug if available (for mixed-event search results),
  // otherwise fall back to provider's eventSlug
  const openFullPage = () => {
    const slug = moment.event_slug || eventSlug;
    const path = slug
      ? `/events/${slug}/moments/${moment.id}?from=lightbox`
      : `/moments/${moment.id}?from=lightbox`;
    router.push(path);
    onClose();
  };

  if (!isOpen || !moment) return null;

  // Get optimized image URL for photos
  const imageUrl = moment.content_type === "photo" && moment.media_url
    ? optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen) || moment.media_url
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Blurred background for landscape photos */}
      {isLandscape && moment.content_type === "photo" && imageUrl && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-40"
        />
      )}

      {/* Top bar with close and full page buttons */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
        {/* Counter */}
        <div className="text-white/70 text-sm">
          {currentIndex + 1} / {moments.length}
        </div>

        <div className="flex items-center gap-2">
          {/* Full page link */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openFullPage();
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Open full page"
            title="Open full page"
          >
            <ExternalLink className="w-5 h-5 text-white" />
          </button>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToPrev();
          }}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Content area */}
      <div
        className="relative z-10 max-w-[95vw] max-h-[85vh] w-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translateX(${touchDiff * 0.3}px)`,
          transition: touchStart === null ? "transform 0.2s ease-out" : "none",
        }}
      >
        {/* Photo */}
        {moment.content_type === "photo" && imageUrl && (
          <img
            src={imageUrl}
            alt={moment.text_content || "Photo"}
            onLoad={handleImageLoad}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        )}

        {/* Video */}
        {moment.content_type === "video" && (
          <div className="w-full max-w-4xl">
            {(moment.video_status === "ready" || !moment.cf_video_uid) && moment.media_url ? (
              <MomentVideoPlayer
                src={moment.media_url}
                hlsSrc={moment.cf_playback_url || undefined}
                poster={moment.thumbnail_url || undefined}
              />
            ) : (
              <div className="aspect-video flex items-center justify-center bg-muted/20 rounded-lg">
                <div className="text-white/70 text-center">
                  <div className="w-12 h-12 border-2 border-white/50 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p>Video processing...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* YouTube */}
        {moment.content_type === "youtube" && moment.youtube_video_id && (
          <div className="w-full max-w-4xl">
            <YouTubeEmbed videoId={moment.youtube_video_id} />
          </div>
        )}

        {/* Audio */}
        {moment.content_type === "audio" && moment.file_url && (
          <div className="w-full max-w-md">
            <AudioPlayer
              url={moment.file_url}
              title={moment.title || moment.original_filename || undefined}
              artist={moment.artist || undefined}
              thumbnailUrl={moment.audio_thumbnail_url || undefined}
            />
          </div>
        )}

        {/* PDF */}
        {moment.content_type === "pdf" && moment.file_url && (
          <div className="w-full max-w-4xl max-h-[85vh] overflow-auto">
            <PDFPreview
              url={moment.file_url}
              filename={moment.original_filename || undefined}
            />
          </div>
        )}

        {/* Image material */}
        {moment.content_type === "image" && moment.file_url && (
          <img
            src={moment.file_url}
            alt={moment.text_content || moment.title || "Image"}
            onLoad={handleImageLoad}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        )}

        {/* Text-only */}
        {moment.content_type === "text" && moment.text_content && (
          <div className="max-w-2xl p-8 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl">
            <p className="text-xl text-white text-center whitespace-pre-wrap">
              {moment.text_content}
            </p>
          </div>
        )}
      </div>

      {/* Caption (if exists) */}
      {moment.text_content && moment.content_type !== "text" && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-center max-w-2xl mx-auto line-clamp-3">
            {moment.text_content}
          </p>
        </div>
      )}

      {/* Swipe hint (mobile only) */}
      {moments.length > 1 && (
        <p className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 text-white/40 text-xs sm:hidden">
          Swipe to navigate
        </p>
      )}
    </div>
  );
}
