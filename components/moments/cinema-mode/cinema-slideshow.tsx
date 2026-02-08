"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause } from "lucide-react";
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
import type { CinemaEventMeta } from "../moments-view-container";
import { CinemaEndCard } from "./cinema-end-card";

interface CinemaSlideshowProps {
  moments: MomentWithProfile[];
  eventSlug: string;
  eventMeta?: CinemaEventMeta;
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
  eventMeta,
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

  // Extract unique contributors for end card
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

  // Warm up HLS.js module cache on cinema mount so it's ready when the first video hits
  useEffect(() => {
    import("hls.js").catch(() => {});
  }, []);

  // Preload next images and videos
  const preloadedRef = useRef(new Set<string>());
  const hlsPreloadRef = useRef<Map<string, { destroy: () => void }>>(new Map());

  useEffect(() => {
    const preloadIndices = [currentIndex + 1, currentIndex + 2];

    preloadIndices.forEach((idx) => {
      if (idx >= moments.length) return;
      const moment = moments[idx];

      if (moment?.content_type === "photo" && moment.media_url) {
        const img = new window.Image();
        img.src = optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen) || moment.media_url;
      } else if (moment?.content_type === "video") {
        const hlsSrc = moment.cf_playback_url;
        const mp4Src = moment.media_url;
        const key = hlsSrc || mp4Src;
        if (!key || preloadedRef.current.has(key)) return;
        preloadedRef.current.add(key);

        if (hlsSrc?.includes(".m3u8")) {
          // HLS: use HLS.js to actually buffer segments (browsers besides Safari can't preload m3u8)
          import("hls.js").then(({ default: Hls }) => {
            if (!Hls.isSupported()) {
              // Safari: native HLS preloading via video element
              const video = document.createElement("video");
              video.preload = "auto";
              video.muted = true;
              video.src = hlsSrc;
              video.load();
              return;
            }
            const video = document.createElement("video");
            video.muted = true;
            const hls = new Hls({ maxBufferLength: 4, maxMaxBufferLength: 8 });
            hls.loadSource(hlsSrc);
            hls.attachMedia(video);
            hlsPreloadRef.current.set(key, hls);

            // Clean up after buffering enough (first fragment loaded)
            let cleaned = false;
            const cleanup = () => {
              if (cleaned) return;
              cleaned = true;
              setTimeout(() => {
                hls.stopLoad();
                hls.detachMedia();
                hls.destroy();
                hlsPreloadRef.current.delete(key);
              }, 2000);
            };
            hls.on(Hls.Events.FRAG_LOADED, cleanup);
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                hls.destroy();
                hlsPreloadRef.current.delete(key);
              }
            });
          });
        } else if (mp4Src) {
          // MP4: browser handles preloading natively
          const video = document.createElement("video");
          video.preload = "auto";
          video.muted = true;
          video.src = mp4Src;
          video.load();
        }
      }
    });
  }, [currentIndex, moments]);

  // Cleanup HLS preload instances on unmount
  useEffect(() => {
    return () => {
      hlsPreloadRef.current.forEach((hls) => hls.destroy());
      hlsPreloadRef.current.clear();
    };
  }, []);

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

      {/* Branded end card */}
      {isEnded && (
        <CinemaEndCard
          eventMeta={eventMeta}
          eventSlug={eventSlug}
          totalMoments={total}
          contributors={contributors}
          onReplay={handleLoop}
          onAddMoment={handleAddMoment}
          onBrowseAll={onSwitchToGrid ? () => { exit(); onSwitchToGrid(); } : undefined}
        />
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
