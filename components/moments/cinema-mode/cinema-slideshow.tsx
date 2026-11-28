"use client";

import { useEffect, useLayoutEffect, useCallback, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Volume2 } from "lucide-react";
import { CinemaPhotoSlide } from "./cinema-photo-slide";
import { CinemaVideoSlide } from "./cinema-video-slide";
import { CinemaControls } from "./cinema-controls";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { useTranslations } from "next-intl";

import {
  useCinemaModeStore,
  useCurrentCinemaMoment,
  useCinemaPlaybackState,
  useCinemaIsTransitioning,
  useCinemaCurrentIndex,
  useCinemaTotalCount,
  useCinemaMoments,
  useCinemaTimerDuration,
  useCinemaShowControls,
  useCinemaSoundOn,
} from "@/lib/stores/cinema-mode-store";
import type { MomentWithProfile } from "@/lib/types";
import type { CinemaEventMeta } from "../moments-view-container";
import { CinemaEndCard } from "./cinema-end-card";
import { CinemaSoundButton, CinemaTrackAnnouncer } from "./cinema-music-chip";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { requestVideoPlayback } from "@/lib/cinema/video-playback";
import { getCinemaClosingCredits } from "@/lib/cinema/closing-credits";
import { CinemaFirstVisitHint, useFirstVisitHint } from "./cinema-first-visit-hint";
import { useCinemaInput } from "./use-cinema-input";

interface CinemaSlideshowProps {
  moments: MomentWithProfile[];
  eventSlug: string;
  eventMeta?: CinemaEventMeta;
  initialIndex?: number;
  totalCount?: number;
  hasMore?: boolean;
  onClose: () => void;
  /** Leave for the grid view, scrolled to the given moment. Falls back to onClose. */
  onShowGrid?: (momentId?: string) => void;
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
  onShowGrid,
  onLoadMore,
}: CinemaSlideshowProps) {
  const router = useRouter();
  const t = useTranslations("moments.cinemaControls");
  const tMoments = useTranslations("moments");
  const rootRef = useRef<HTMLDivElement>(null);

  // Store state - use individual selectors to avoid subscribing to entire state
  // Actions are stable and accessed directly from the store (won't cause re-renders)
  const store = useCinemaModeStore;
  const start = store.getState().start;
  const exit = store.getState().exit;
  const play = store.getState().play;
  const goTo = store.getState().goTo;
  const onVideoEnded = store.getState().onVideoEnded;
  const onVideoTimeUpdate = store.getState().onVideoTimeUpdate;
  const revealChrome = store.getState().revealChrome;

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
  const closingCredits = getCinemaClosingCredits(eventSlug);
  const hasSoundtrack = useAudioPlayerStore(
    (state) => state.playlist?.eventSlug === eventSlug && state.tracks.length > 0,
  );
  const soundOn = useCinemaSoundOn();
  const autoplayBlocked = useAudioPlayerStore((state) => state.autoplayBlocked);
  const [blockedVideoId, setBlockedVideoId] = useState<string | null>(null);
  const hasActiveVideo = !isEnded && currentMoment?.content_type === "video";

  const videoSoundBlocked = hasActiveVideo && blockedVideoId === currentMoment?.id;
  const showUnmute = soundOn && !isPaused && !isEnded && (
    hasActiveVideo ? videoSoundBlocked : hasSoundtrack && autoplayBlocked
  );

  useLayoutEffect(() => {
    if (!hasSoundtrack || playbackState === "idle") return;
    if (isPaused || !soundOn) {
      const pauseSoundtrack = (audio: ReturnType<typeof useAudioPlayerStore.getState>) => {
        if (audio.playlist?.eventSlug === eventSlug &&
            (audio.isPlaying || audio.isLoading || audio.autoplayBlocked)) audio.pause();
      };
      pauseSoundtrack(useAudioPlayerStore.getState());
      return useAudioPlayerStore.subscribe(pauseSoundtrack);
    }

    const audio = useAudioPlayerStore.getState();
    audio.setCinemaVolumeScale(hasActiveVideo ? 0.5 : 1);
    if (!audio.isPlaying && !audio.isLoading && !audio.autoplayBlocked) void audio.play();
    return () => useAudioPlayerStore.getState().setCinemaVolumeScale(1);
  }, [eventSlug, hasSoundtrack, hasActiveVideo, isPaused, playbackState, soundOn]);

  const handleUnmute = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const video = rootRef.current?.querySelector("video");
    if (useAudioPlayerStore.getState().autoplayBlocked) void useAudioPlayerStore.getState().play();
    if (video && videoSoundBlocked) {
      void requestVideoPlayback(video, true, true).then((started) => {
        if (started && !video.muted) setBlockedVideoId(null);
      });
    } else if (!video) {
      void useAudioPlayerStore.getState().play();
    }
  };

  const handleToggleSound = useCallback(() => {
    const cinema = useCinemaModeStore.getState();
    const audio = useAudioPlayerStore.getState();
    const video = rootRef.current?.querySelector("video");
    if (!video && cinema.soundOn && audio.autoplayBlocked) {
      void audio.play();
      return;
    }
    cinema.toggleSound();
    if (video) {
      video.muted = cinema.soundOn;
      if (!cinema.soundOn && cinema.playbackState === "playing") {
        void requestVideoPlayback(video, true);
      }
    } else if (!cinema.soundOn && hasSoundtrack && cinema.playbackState !== "paused") {
      void audio.play();
    }
  }, [hasSoundtrack]);

  // Extract unique contributors for end card
  const contributors = useMemo(() => {
    const seen = new Set<string>();
    return moments
      .filter((m) => {
        const contributorId = m.credit_venue_id || m.user_id;
        if (!contributorId || seen.has(contributorId)) return false;
        seen.add(contributorId);
        return true;
      })
      .map((m) => ({
        id: m.credit_venue_id || m.user_id,
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
    };
  }, []); // Only run once on mount

  // Infinite loading: fetch more moments when approaching the end of loaded batch
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const storeMoments = useCinemaModeStore.getState().moments;
    const storeHasMore = useCinemaModeStore.getState().hasMore;

    // Trigger load when within 5 moments of the end
    if (
      storeHasMore &&
      !isLoadingMoreRef.current &&
      onLoadMore &&
      currentIndex >= storeMoments.length - 5
    ) {
      isLoadingMoreRef.current = true;
      onLoadMore().finally(() => {
        isLoadingMoreRef.current = false;
      });
    }
  }, [currentIndex, onLoadMore]);

  // Sync new moments from parent (loaded by grid) into the cinema store
  const prevMomentsLengthRef = useRef(initialMoments.length);

  useEffect(() => {
    if (initialMoments.length > prevMomentsLengthRef.current) {
      const newMoments = initialMoments.slice(prevMomentsLengthRef.current);
      const appendMoments = useCinemaModeStore.getState().appendMoments;
      appendMoments(newMoments);
      prevMomentsLengthRef.current = initialMoments.length;
    }
    useCinemaModeStore.getState().setHasMore(hasMore);
  }, [initialMoments, hasMore]);

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
        const hlsSrc = moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid);
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

  const handleExit = useCallback(() => {
    exit();
    onClose();
  }, [exit, onClose]);

  const handleShowGallery = useCallback((momentId?: string) => {
    exit();
    if (onShowGrid) onShowGrid(momentId);
    else onClose();
  }, [exit, onClose, onShowGrid]);

  const { flashIcon, showFlash, handleClickCapture, handleClick, handleTouchStart, handleTouchEnd } =
    useCinemaInput(handleExit, eventSlug);

  // First-visit hint: chrome starts hidden so the hint teaches the tap.
  const chromeVisible = useCinemaShowControls();
  const hintVisible = useFirstVisitHint(chromeVisible);
  useEffect(() => {
    if (hintVisible) useCinemaModeStore.getState().hideControls();
  }, [hintVisible]);

  // Focus management: take focus on open, give it back on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const handleLoop = useCallback(() => {
    triggerHaptic("selection");
    goTo(0);
    play();
  }, [goTo, play]);

  const handleAddMoment = useCallback(() => {
    triggerHaptic("selection");
    exit();
    router.push(`/events/${eventSlug}/moments/new`);
  }, [exit, eventSlug, router]);

  if (!currentMoment && !isEnded) {
    return (
      <div className="fixed inset-0 z-[55] bg-black flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("dialogLabel")}
      tabIndex={-1}
      className="fixed inset-0 z-[55] bg-black outline-none touch-manipulation"
      onClickCapture={handleClickCapture}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {currentMoment && (!isEnded || !closingCredits) && (
        <>
          {currentMoment.content_type === "photo" && (
            <CinemaPhotoSlide
              moment={currentMoment}
              duration={timerDuration}
              isActive={!isPaused && !isEnded}
              isTransitioning={isTransitioning}
              motionSeed={eventSlug}
              index={currentIndex}
            />
          )}

          {currentMoment.content_type === "video" && (
            <CinemaVideoSlide
              moment={currentMoment}
              isActive={!isEnded}
              isTransitioning={isTransitioning}
              isPaused={isPaused}
              onSoundBlocked={setBlockedVideoId}
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
      {isEnded && closingCredits ? (
        <>
          <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#14100d] bg-[radial-gradient(ellipse_at_50%_28%,#3b271b_0%,#14100d_54%,#0a0807_100%)] px-6 py-20 text-center">
            <div className="max-w-xl text-[#fbf1df] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
              <h2 className="font-serif text-4xl leading-[1.12] text-balance sm:text-6xl">
                {t("closingThankYou")}
              </h2>
              <p className="mt-7 text-base text-[#ead7bc] sm:text-lg">
                {closingCredits.artists.join(" · ")}
              </p>
              <p className="mt-2 text-base text-[#ead7bc] sm:text-lg">{closingCredits.venue}</p>
              <button
                type="button"
                data-cinema-audio-control
                onClick={(event) => {
                  event.stopPropagation();
                  handleLoop();
                }}
                className="mt-9 rounded-full border border-white/25 px-5 py-2.5 text-sm hover:bg-white/10"
              >
                {tMoments("replay")}
              </button>
            </div>
          </div>
          {hasSoundtrack && (
            <div className="absolute left-4 top-4 z-40">
              <CinemaSoundButton onToggle={handleToggleSound} />
            </div>
          )}
        </>
      ) : isEnded && (
        <CinemaEndCard
          eventMeta={eventMeta}
          eventSlug={eventSlug}
          totalMoments={total}
          contributors={contributors}
          onReplay={handleLoop}
          onAddMoment={handleAddMoment}
        />
      )}

      {showUnmute && (
        <button
          type="button"
          data-cinema-audio-control
          onClick={handleUnmute}
          onTouchStart={(event) => event.stopPropagation()}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex min-h-11 items-center gap-2 rounded-full bg-black/75 px-4 text-sm font-medium text-white backdrop-blur-sm"
        >
          <Volume2 className="size-4" aria-hidden="true" />
          {t("unmute")}
        </button>
      )}

      {/* Controls overlay (counter + timeline — view mode switcher is persistent/separate) */}
      {!isEnded && (
        <CinemaControls
          eventSlug={eventSlug}
          eventTitle={eventMeta?.title}
          showSoundControl={!showUnmute && (hasSoundtrack || hasActiveVideo)}
          onToggleSound={handleToggleSound}
          onExit={handleExit}
          onShowGallery={handleShowGallery}
          focusFallbackRef={rootRef}
        />
      )}

      <CinemaFirstVisitHint visible={hintVisible} />
      <CinemaTrackAnnouncer />
    </div>
  );
}
