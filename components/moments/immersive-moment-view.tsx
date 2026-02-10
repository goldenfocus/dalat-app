"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MessageCircle, Share2, ExternalLink, Grid3X3, Loader2, RotateCcw, Camera, Sparkles } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDistanceToNow } from "date-fns";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { MomentVideoPlayer } from "./moment-video-player";
import { RelatedEventsSection } from "./related-events-section";
import { CommentsSheet } from "@/components/comments/comments-sheet";
import { ImmersiveCommentsPanel } from "@/components/comments/immersive-comments-panel";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { MomentWithProfile } from "@/lib/types";

// Hilariously random end-of-album phrases
const END_PHRASES = [
  { main: "That's all folks!", sub: "You've officially seen everything. Achievement unlocked." },
  { main: "The End... or is it?", sub: "Plot twist: you can add more moments!" },
  { main: "You speedran this album!", sub: "New world record? Probably not. But still impressive." },
  { main: "Congratulations, you reached the edge of the internet!", sub: "Just kidding, there's more out there. But not here." },
  { main: "Album complete!", sub: "Your prize? The memories. And maybe some FOMO." },
  { main: "You've seen things...", sub: "Things other people might have also seen. You're not special. But you're here!" },
  { main: "No more moments!", sub: "Unless... you make one? *wink wink*" },
  { main: "EOF: End of Fun", sub: "Just kidding, the fun never ends. Loop it!" },
  { main: "You made it!", sub: "Through all the photos. Some were blurry. That's okay." },
  { main: "Achievement: Album Completionist", sub: "Your reward: the satisfaction of a job well scrolled." },
  { main: "This is where the credits would roll", sub: "But we're too lazy for that. Here are the stars instead." },
  { main: "Fin.", sub: "That's French for 'add your own moment already!'" },
  { main: "You've reached enlightenment!", sub: "Or at least the end of this album. Same thing, basically." },
  { main: "The algorithm has nothing left for you", sub: "Time to create your own content. No pressure." },
  { main: "End of transmission", sub: "Beep boop. Add moments to extend transmission." },
];

interface ImmersiveMomentViewProps {
  moments: MomentWithProfile[];
  initialIndex?: number;
  eventId: string;
  eventSlug: string;
  onClose: () => void;
  onSwitchToGrid?: () => void;
  /** Called when user reaches end and there are more moments to load */
  onLoadMore?: () => Promise<void>;
  /** Whether there are more moments available to load */
  hasMore?: boolean;
  /** Total number of moments (for progress display when more exist) */
  totalCount?: number;
}

export function ImmersiveMomentView({
  moments,
  initialIndex = 0,
  eventId,
  eventSlug,
  onClose,
  onSwitchToGrid,
  onLoadMore,
  hasMore = false,
  totalCount,
}: ImmersiveMomentViewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [showEndScreen, setShowEndScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const moment = moments[currentIndex];

  // Handle out-of-bounds index (e.g., after filter change reduces array length)
  useEffect(() => {
    if (moments.length > 0 && currentIndex >= moments.length) {
      // Index is out of bounds - clamp to last item and show end screen
      setCurrentIndex(moments.length - 1);
      setShowEndScreen(true);
    }
  }, [moments.length, currentIndex]);

  // Get random phrase (memoized to stay consistent during session)
  const endPhrase = useMemo(() => {
    return END_PHRASES[Math.floor(Math.random() * END_PHRASES.length)];
  }, []);

  // Extract unique contributors from moments
  const contributors = useMemo(() => {
    const seen = new Set<string>();
    return moments
      .filter((m) => {
        if (!m.user_id || seen.has(m.user_id)) return false;
        seen.add(m.user_id);
        return true;
      })
      .map((m) => ({
        id: m.user_id,
        avatar: m.avatar_url,
        name: m.display_name || m.username || "Anonymous",
      }))
      .slice(0, 8); // Max 8 avatars for visual balance
  }, [moments]);

  // Fetch current user on mount
  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user } }: { data: { user: User | null } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id);
    }
    fetchUser();
  }, []);

  // Fetch comment count for current moment
  useEffect(() => {
    if (!moment?.id || commentCounts.has(moment.id)) return;

    fetch(`/api/comments/count?targetType=moment&targetId=${moment.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.total_count === "number") {
          setCommentCounts((prev) => new Map(prev).set(moment.id, data.total_count));
        }
      })
      .catch(console.error);
  }, [moment?.id, commentCounts]);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < moments.length - 1;

  // Navigate to previous/next
  const goToPrev = useCallback(() => {
    if (showEndScreen) {
      // Dismiss end screen, stay on last moment
      setShowEndScreen(false);
    } else if (hasPrev) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [hasPrev, showEndScreen]);

  const goToNext = useCallback(async () => {
    if (hasNext) {
      setCurrentIndex((prev) => prev + 1);
      setShowEndScreen(false);
    } else if (hasMore && onLoadMore && !isLoadingMore) {
      // At the last loaded moment but more exist - fetch them
      setIsLoadingMore(true);
      await onLoadMore();
      setIsLoadingMore(false);
      // After loading, advance to next (which is now available)
      setCurrentIndex((prev) => prev + 1);
    } else if (!hasMore && !showEndScreen) {
      // At the very end - show the end screen!
      triggerHaptic("success");
      setShowEndScreen(true);
    }
  }, [hasNext, hasMore, onLoadMore, isLoadingMore, showEndScreen]);

  // Loop back to start
  const handleLoop = useCallback(() => {
    triggerHaptic("selection");
    setCurrentIndex(0);
    setShowEndScreen(false);
  }, []);

  // Navigate to add moment
  const handleAddMoment = useCallback(() => {
    triggerHaptic("selection");
    router.push(`/events/${eventSlug}/moments/new`);
    onClose();
  }, [router, eventSlug, onClose]);

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

  // Open full page with context so back navigation works properly
  const openFullPage = () => {
    router.push(`/events/${eventSlug}/moments/${moment.id}?from=immersive`);
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

  // Handle empty moments array (e.g., filter returned no results)
  if (!moment) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white max-w-sm mx-4">
          <p className="text-lg mb-2">No moments to show</p>
          <p className="text-white/60 text-sm mb-6">
            Try changing your filter or check back later
          </p>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Get optimized image URL
  const imageUrl = moment.content_type === "photo" && moment.media_url
    ? optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen) || moment.media_url
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main content area - takes full width on mobile, left side on desktop */}
      <div className="flex-1 relative flex flex-col min-w-0">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            {/* Progress indicator */}
            <span className="text-white/70 text-sm font-medium">
              {currentIndex + 1} / {totalCount ?? moments.length}
            </span>
          </div>

          {/* Close/mode-switch handled by FloatingViewModeSwitcher */}
        </div>

        {/* Content area */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden px-4 py-16 lg:py-20">
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
              <MomentVideoPlayer
                src={moment.media_url}
                hlsSrc={moment.cf_playback_url || undefined}
                poster={moment.thumbnail_url || undefined}
              />
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

          {/* Navigation arrows - vertical on mobile/tablet, horizontal on desktop */}
          {/* Mobile/tablet: vertical arrows on right */}
          <div className="flex lg:hidden absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-2">
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
              disabled={!hasNext && !hasMore}
              className={cn(
                "w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white transition-all",
                (hasNext || hasMore) ? "hover:bg-white/20" : "opacity-30 cursor-not-allowed"
              )}
              aria-label="Next"
            >
              {isLoadingMore ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ChevronDown className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Desktop: horizontal arrows on left/right of content */}
          <button
            onClick={goToPrev}
            disabled={!hasPrev}
            className={cn(
              "hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm items-center justify-center text-white transition-all",
              hasPrev ? "hover:bg-white/20 hover:scale-105" : "opacity-30 cursor-not-allowed"
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={goToNext}
            disabled={!hasNext && !hasMore}
            className={cn(
              "hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm items-center justify-center text-white transition-all",
              (hasNext || hasMore) ? "hover:bg-white/20 hover:scale-105" : "opacity-30 cursor-not-allowed"
            )}
            aria-label="Next"
          >
            {isLoadingMore ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <ChevronRight className="w-7 h-7" />
            )}
          </button>

          {/* Mobile: Right side action buttons (hidden on desktop where we have panel) */}
          <div className="lg:hidden absolute right-4 bottom-32 flex flex-col items-center gap-4">
            {/* Comments - opens sheet overlay */}
            <button
              onClick={() => {
                triggerHaptic("selection");
                setShowComments(true);
              }}
              className="relative w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex flex-col items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all"
              aria-label="View comments"
            >
              <MessageCircle className="w-6 h-6" />
              {(commentCounts.get(moment.id) ?? 0) > 0 && (
                <span className="text-[10px] font-medium mt-0.5">
                  {commentCounts.get(moment.id)}
                </span>
              )}
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
        <div className="absolute bottom-0 left-0 right-0 lg:right-auto z-20 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
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
              <p className="text-white text-sm leading-relaxed line-clamp-3 lg:line-clamp-none lg:max-h-24 lg:overflow-y-auto">
                {moment.text_content}
              </p>
            )}

            {/* Desktop: Action bar with prominent buttons */}
            <div className="hidden lg:flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/20 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                onClick={openFullPage}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/20 active:scale-95 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                Full page
              </button>
            </div>
          </div>
        </div>

        {/* Swipe hint (mobile) */}
        {moments.length > 1 && !showEndScreen && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 text-white/40 text-xs lg:hidden animate-pulse">
            Swipe up/down to browse
          </div>
        )}
      </div>

      {/* Desktop: Always-visible comments panel on right side */}
      <div className="hidden lg:flex w-[380px] flex-shrink-0 border-l border-white/10">
        <ImmersiveCommentsPanel
          targetType="moment"
          targetId={moment.id}
          contentOwnerId={moment.user_id}
          currentUserId={currentUserId}
          initialCount={commentCounts.get(moment.id) ?? 0}
          onCountChange={(count) => {
            setCommentCounts((prev) => new Map(prev).set(moment.id, count));
          }}
          className="w-full"
        />
      </div>

      {/* End of Album Screen - overlays everything including comments panel */}
      {showEndScreen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/95 animate-in fade-in duration-300">
          {/* Sparkle decorations */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <Sparkles className="absolute top-[15%] left-[10%] w-6 h-6 text-yellow-400/60 animate-pulse" />
            <Sparkles className="absolute top-[25%] right-[15%] w-4 h-4 text-pink-400/50 animate-pulse delay-100" />
            <Sparkles className="absolute bottom-[30%] left-[20%] w-5 h-5 text-blue-400/50 animate-pulse delay-200" />
            <Sparkles className="absolute top-[40%] right-[8%] w-3 h-3 text-green-400/40 animate-pulse delay-300" />
            <Sparkles className="absolute bottom-[40%] right-[25%] w-4 h-4 text-purple-400/50 animate-pulse delay-150" />
          </div>

          <div className="relative max-w-sm mx-4 text-center">
            {/* Main message */}
            <h2 className="text-2xl font-bold text-white mb-2 animate-in slide-in-from-bottom-4 duration-500">
              {endPhrase.main}
            </h2>
            <p className="text-white/60 text-sm mb-8 animate-in slide-in-from-bottom-4 duration-500 delay-100">
              {endPhrase.sub}
            </p>

            {/* Contributors */}
            {contributors.length > 0 && (
              <div className="mb-6 animate-in slide-in-from-bottom-4 duration-500 delay-200">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
                  {contributors.length === 1 ? "The star of the show" : `${contributors.length} contributors made this happen`}
                </p>
                <div className="flex justify-center -space-x-2">
                  {contributors.map((c, i) => (
                    <div
                      key={c.id}
                      className="relative transition-transform hover:scale-110 hover:z-10"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <UserAvatar
                        src={c.avatar}
                        alt={c.name}
                        size="md"
                        className="ring-2 ring-black"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Events - YouTube-style discovery */}
            <RelatedEventsSection
              eventId={eventId}
              onNavigate={(slug) => {
                router.push(`/events/${slug}/moments?view=immersive`);
                onClose();
              }}
              className="mb-6"
            />

            {/* Action buttons */}
            <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-500 delay-300">
              <button
                onClick={handleLoop}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-full bg-white text-black font-medium hover:bg-white/90 active:scale-95 transition-all"
              >
                <RotateCcw className="w-5 h-5" />
                Watch again
              </button>

              <button
                onClick={handleAddMoment}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 text-white font-medium hover:opacity-90 active:scale-95 transition-all"
              >
                <Camera className="w-5 h-5" />
                Add your moment
              </button>

              <button
                onClick={() => {
                  triggerHaptic("selection");
                  onClose();
                }}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-full bg-white/10 text-white font-medium hover:bg-white/20 active:scale-95 transition-all"
              >
                <Grid3X3 className="w-5 h-5" />
                Browse all moments
              </button>
            </div>

            {/* Stats */}
            <p className="mt-6 text-white/30 text-xs animate-in slide-in-from-bottom-4 duration-500 delay-500">
              {moments.length} moment{moments.length !== 1 ? "s" : ""} in this album
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={() => setShowEndScreen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Back to last moment"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      {/* Mobile only: Comments sheet overlay (desktop uses side panel) */}
      <div className="lg:hidden">
        <CommentsSheet
          open={showComments}
          onOpenChange={setShowComments}
          targetType="moment"
          targetId={moment.id}
          eventSlug={eventSlug}
          contentTitle={moment.text_content || "Moment"}
          contentOwnerId={moment.user_id}
          currentUserId={currentUserId}
          initialCount={commentCounts.get(moment.id) ?? 0}
          onCountChange={(count) => {
            setCommentCounts((prev) => new Map(prev).set(moment.id, count));
          }}
        />
      </div>
    </div>
  );
}
