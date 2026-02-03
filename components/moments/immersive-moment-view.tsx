"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronUp, ChevronDown, MessageCircle, Share2, ExternalLink, Grid3X3 } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDistanceToNow } from "date-fns";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { MomentVideoPlayer } from "./moment-video-player";
import { cn } from "@/lib/utils";
import type { MomentWithProfile } from "@/lib/types";

interface ImmersiveMomentViewProps {
  moments: MomentWithProfile[];
  initialIndex?: number;
  eventSlug: string;
  onClose: () => void;
  onSwitchToGrid?: () => void;
}

export function ImmersiveMomentView({
  moments,
  initialIndex = 0,
  eventSlug,
  onClose,
  onSwitchToGrid,
}: ImmersiveMomentViewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const moment = moments[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < moments.length - 1;

  // Navigate to previous/next
  const goToPrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [hasPrev]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [hasNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowUp":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowDown":
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
  }, [onClose, goToPrev, goToNext]);

  // Touch/swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;

    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;

    // Swipe threshold of 50px
    if (diff > 50) {
      goToNext(); // Swipe up = next
    } else if (diff < -50) {
      goToPrev(); // Swipe down = prev
    }

    setTouchStart(null);
  };

  // Open full page
  const openFullPage = () => {
    router.push(`/events/${eventSlug}/moments/${moment.id}`);
    onClose();
  };

  // Share
  const handleShare = async () => {
    const url = `${window.location.origin}/events/${eventSlug}/moments/${moment.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  if (!moment) return null;

  // Get optimized image URL
  const imageUrl = moment.content_type === "photo" && moment.media_url
    ? optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen) || moment.media_url
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          <span className="text-white/70 text-sm font-medium">
            {currentIndex + 1} / {moments.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch to grid */}
          {onSwitchToGrid && (
            <button
              onClick={onSwitchToGrid}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Switch to grid view"
            >
              <Grid3X3 className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden px-4 py-16">
        {/* Photo */}
        {moment.content_type === "photo" && imageUrl && (
          <img
            src={imageUrl}
            alt={moment.text_content || "Photo"}
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
          />
        )}

        {/* Video */}
        {moment.content_type === "video" && moment.media_url && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-full max-w-lg">
              <MomentVideoPlayer
                src={moment.media_url}
                hlsSrc={moment.cf_playback_url || undefined}
                poster={moment.thumbnail_url || undefined}
              />
            </div>
          </div>
        )}

        {/* Text-only */}
        {moment.content_type === "text" && moment.text_content && (
          <div className="max-w-lg p-8">
            <p className="text-2xl text-white text-center whitespace-pre-wrap leading-relaxed">
              {moment.text_content}
            </p>
          </div>
        )}

        {/* Navigation arrows (desktop) */}
        <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-2">
          <button
            onClick={goToPrev}
            disabled={!hasPrev}
            className={cn(
              "w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white transition-all",
              hasPrev ? "hover:bg-white/20" : "opacity-30 cursor-not-allowed"
            )}
            aria-label="Previous"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            disabled={!hasNext}
            className={cn(
              "w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white transition-all",
              hasNext ? "hover:bg-white/20" : "opacity-30 cursor-not-allowed"
            )}
            aria-label="Next"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

        {/* Right side actions */}
        <div className="absolute right-4 bottom-32 flex flex-col items-center gap-4">
          {/* Comments */}
          <button
            onClick={openFullPage}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="View comments"
          >
            <MessageCircle className="w-6 h-6" />
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Share"
          >
            <Share2 className="w-6 h-6" />
          </button>

          {/* Full page */}
          <button
            onClick={openFullPage}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Open full page"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="max-w-lg">
          {/* User info */}
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar
              src={moment.avatar_url}
              alt={moment.display_name || moment.username || ""}
              size="sm"
            />
            <div>
              <p className="text-white font-medium text-sm">
                {moment.display_name || moment.username || "Anonymous"}
              </p>
              <p className="text-white/60 text-xs">
                {formatDistanceToNow(new Date(moment.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Caption */}
          {moment.text_content && moment.content_type !== "text" && (
            <p className="text-white text-sm leading-relaxed line-clamp-3">
              {moment.text_content}
            </p>
          )}
        </div>
      </div>

      {/* Swipe hint (mobile) */}
      {moments.length > 1 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 text-white/40 text-xs sm:hidden animate-pulse">
          Swipe up/down to browse
        </div>
      )}
    </div>
  );
}
