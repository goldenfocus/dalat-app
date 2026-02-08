"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Camera, Grid3X3, Sparkles, Play, Pause } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CinemaPhotoSlide } from "./cinema-photo-slide";
import { CinemaVideoSlide } from "./cinema-video-slide";
import { CinemaControls } from "./cinema-controls";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { createEffectScheduler, type EffectSchedulerState } from "@/lib/cinema/ken-burns-effects";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  useCinemaModeStore,
  useCurrentCinemaMoment,
  useCinemaPlaybackState,
  useCinemaIsTransitioning,
  useCinemaCurrentIndex,
  useCinemaTotalCount,
  useCinemaMoments,
  useCinemaTimerDuration,
} from "@/lib/stores/cinema-mode-store";
import type { MomentWithProfile } from "@/lib/types";

// End phrases (same as immersive view)
const END_PHRASES = [
  { main: "That's all folks!", sub: "You've officially seen everything. Achievement unlocked." },
  { main: "The End... or is it?", sub: "Plot twist: you can add more moments!" },
  { main: "You speedran this album!", sub: "New world record? Probably not. But still impressive." },
  { main: "Album complete!", sub: "Your prize? The memories. And maybe some FOMO." },
  { main: "No more moments!", sub: "Unless... you make one? *wink wink*" },
  { main: "You made it!", sub: "Through all the photos. Some were blurry. That's okay." },
  { main: "Fin.", sub: "That's French for 'add your own moment already!'" },
  { main: "End of transmission", sub: "Beep boop. Add moments to extend transmission." },
];

interface CinemaSlideshowProps {
  moments: MomentWithProfile[];
  eventSlug: string;
  initialIndex?: number;
  totalCount?: number;
  hasMore?: boolean;
  onClose: () => void;
  onSwitchToGrid?: () => void;
  onSwitchToImmersive?: () => void;
  onLoadMore?: () => Promise<void>;
}

export function CinemaSlideshow({
  moments: initialMoments,
  eventSlug,
  initialIndex = 0,
  totalCount,
  hasMore = false,
  onClose,
  onSwitchToGrid,
  onSwitchToImmersive,
  onLoadMore,
}: CinemaSlideshowProps) {
  const router = useRouter();
  const effectSchedulerRef = useRef<EffectSchedulerState>(createEffectScheduler());

  const handleEffectSelected = useCallback((newState: EffectSchedulerState) => {
    effectSchedulerRef.current = newState;
  }, []);

  // Store state - use individual selectors to avoid subscribing to entire state
  // Actions are stable and accessed directly from the store (won't cause re-renders)
  const store = useCinemaModeStore;
  const start = store.getState().start;
  const exit = store.getState().exit;
  const play = store.getState().play;
  const togglePlayback = store.getState().togglePlayback;
  const next = store.getState().next;
  const previous = store.getState().previous;
  const goTo = store.getState().goTo;
  const onVideoEnded = store.getState().onVideoEnded;
  const onVideoTimeUpdate = store.getState().onVideoTimeUpdate;
  const showControlsTemporarily = store.getState().showControlsTemporarily;

  // Use selector hooks for reactive state (only re-render when specific values change)
  const moments = useCinemaMoments();
  const timerDuration = useCinemaTimerDuration();
  const currentMoment = useCurrentCinemaMoment();
  const playbackState = useCinemaPlaybackState();
  const isTransitioning = useCinemaIsTransitioning();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();

  const isPaused = playbackState === "paused";
  const isEnded = playbackState === "ended";

  // Brief icon flash when toggling play/pause (Instagram Stories style)
  const [flashIcon, setFlashIcon] = useState<"play" | "pause" | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((icon: "play" | "pause") => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashIcon(icon);
    flashTimeoutRef.current = setTimeout(() => setFlashIcon(null), 600);
  }, []);

  // Random end phrase
  const endPhrase = useMemo(() => {
    return END_PHRASES[Math.floor(Math.random() * END_PHRASES.length)];
  }, []);

  // Extract unique contributors
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
      .slice(0, 8);
  }, [moments]);

  // Initialize cinema mode
  useEffect(() => {
    start(initialMoments, eventSlug, initialIndex, totalCount ?? initialMoments.length, hasMore);

    return () => {
      exit();
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []); // Only run once on mount

  // Preload next images and videos
  const preloadedVideosRef = useRef(new Set<string>());

  useEffect(() => {
    const preloadIndices = [currentIndex + 1, currentIndex + 2];

    preloadIndices.forEach((idx) => {
      if (idx >= moments.length) return;
      const moment = moments[idx];

      if (moment?.content_type === "photo" && moment.media_url) {
        const img = new window.Image();
        img.src = optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen) || moment.media_url;
      } else if (moment?.content_type === "video") {
        const src = moment.cf_playback_url || moment.media_url;
        if (src && !preloadedVideosRef.current.has(src)) {
          preloadedVideosRef.current.add(src);
          const video = document.createElement("video");
          video.preload = "auto";
          video.muted = true;
          video.src = src;
          video.load();
        }
      }
    });
  }, [currentIndex, moments]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          handleExit();
          break;
        case " ":
          e.preventDefault();
          handleToggleTap();
          break;
        case "ArrowLeft":
          e.preventDefault();
          previous();
          break;
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Touch/swipe handling — distinguish taps from swipes
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const didSwipeRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    didSwipeRef.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;

    // Horizontal swipe (left/right navigation)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      didSwipeRef.current = true;
      if (deltaX > 0) {
        previous();
      } else {
        next();
      }
      triggerHaptic("selection");
    }

    // Vertical swipe down = exit
    if (deltaY > 100 && Math.abs(deltaY) > Math.abs(deltaX)) {
      didSwipeRef.current = true;
      triggerHaptic("selection");
      handleExit();
    }

    touchStartRef.current = null;
  };

  // Tap = toggle play/pause (only if it wasn't a swipe)
  const handleToggleTap = useCallback(() => {
    const state = useCinemaModeStore.getState();
    if (state.playbackState === "playing") {
      showFlash("pause");
    } else {
      showFlash("play");
    }
    triggerHaptic("selection");
    togglePlayback();
    showControlsTemporarily();
  }, [togglePlayback, showControlsTemporarily, showFlash]);

  const handleClick = useCallback(() => {
    // On touch devices, onClick fires after touchEnd.
    // Only toggle if it wasn't a swipe.
    if (didSwipeRef.current) return;
    handleToggleTap();
  }, [handleToggleTap]);

  const handleExit = useCallback(() => {
    exit();
    onClose();
  }, [exit, onClose]);

  const handleLoop = useCallback(() => {
    triggerHaptic("selection");
    goTo(0);
    play();
  }, [goTo, play]);

  const handleAddMoment = useCallback(() => {
    triggerHaptic("selection");
    exit();
    router.push(`/events/${eventSlug}/moments/upload`);
  }, [exit, eventSlug, router]);

  if (!currentMoment && !isEnded) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Current moment slide */}
      {currentMoment && !isEnded && (
        <>
          {currentMoment.content_type === "photo" && (
            <CinemaPhotoSlide
              moment={currentMoment}
              duration={timerDuration}
              isActive={!isPaused}
              isTransitioning={isTransitioning}
              effectSchedulerState={effectSchedulerRef.current}
              onEffectSelected={handleEffectSelected}
            />
          )}

          {currentMoment.content_type === "video" && (
            <CinemaVideoSlide
              moment={currentMoment}
              isActive={true}
              isTransitioning={isTransitioning}
              isPaused={isPaused}
              onEnded={onVideoEnded}
              onTimeUpdate={onVideoTimeUpdate}
            />
          )}
        </>
      )}

      {/* Brief play/pause flash icon (Instagram Stories style) */}
      {flashIcon && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="p-5 rounded-full bg-black/40 backdrop-blur-sm text-white animate-in fade-in zoom-in-50 duration-200">
            {flashIcon === "pause" ? (
              <Pause className="w-10 h-10" />
            ) : (
              <Play className="w-10 h-10 ml-1" />
            )}
          </div>
        </div>
      )}

      {/* End screen */}
      {isEnded && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/95">
          {/* Sparkle decorations */}
          <div className="absolute top-10 left-10 text-white/20 animate-pulse">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="absolute top-20 right-20 text-white/15 animate-pulse delay-300">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="absolute bottom-32 left-16 text-white/10 animate-pulse delay-700">
            <Sparkles className="w-5 h-5" />
          </div>

          <div className="max-w-sm mx-4 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{endPhrase.main}</h2>
            <p className="text-white/60 text-sm mb-8">{endPhrase.sub}</p>

            {/* Contributors */}
            {contributors.length > 0 && (
              <div className="mb-8">
                <p className="text-white/40 text-xs mb-3">Contributors</p>
                <div className="flex justify-center -space-x-2">
                  {contributors.map((contributor) => (
                    <UserAvatar
                      key={contributor.id}
                      src={contributor.avatar}
                      alt={contributor.name}
                      size="sm"
                      className="ring-2 ring-black"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); handleLoop(); }}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="w-4 h-4" />
                Watch again
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddMoment(); }}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Add your moment
              </button>
              {onSwitchToGrid && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exit();
                    onSwitchToGrid();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 text-white/70 font-medium hover:bg-white/10 transition-colors"
                >
                  <Grid3X3 className="w-4 h-4" />
                  Browse all moments
                </button>
              )}
            </div>

            {/* Stats */}
            <p className="mt-6 text-white/30 text-xs">{total} moments in this album</p>
          </div>
        </div>
      )}

      {/* Controls overlay (top bar + timeline only, no center button) */}
      {!isEnded && (
        <CinemaControls
          onExit={handleExit}
          onSwitchToGrid={onSwitchToGrid}
          onSwitchToImmersive={onSwitchToImmersive}
        />
      )}
    </div>
  );
}
