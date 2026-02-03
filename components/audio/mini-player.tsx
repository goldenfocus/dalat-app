"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ChevronUp,
  Music,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio-metadata";
import {
  useAudioPlayerStore,
  useCurrentTrack,
  useIsPlayerVisible,
} from "@/lib/stores/audio-player-store";

export function MiniPlayer() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);

  const isVisible = useIsPlayerVisible();
  const currentTrack = useCurrentTrack();

  const {
    tracks,
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    repeatMode,
    shuffle,
    play,
    pause,
    togglePlay,
    next,
    previous,
    onTrackEnded,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    toggleRepeat,
    toggleShuffle,
    close,
  } = useAudioPlayerStore();

  // UI state for time display toggle
  const [showRemaining, setShowRemaining] = useState(false);

  // Track the current track ID to detect changes
  const prevTrackIdRef = useRef<string | null>(null);

  // Handle track changes - load new source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const trackChanged = prevTrackIdRef.current !== currentTrack.id;

    if (trackChanged) {
      prevTrackIdRef.current = currentTrack.id;
      // Load new track - set flag to play when ready
      if (isPlaying) {
        shouldPlayWhenReady.current = true;
      }
      audio.src = currentTrack.file_url;
      audio.load();
    }
  }, [currentTrack?.id, currentTrack?.file_url, isPlaying]);

  // Sync play/pause state with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying && audio.paused) {
      audio.play().catch(() => setIsPlaying(false));
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  // Track if we're auto-advancing (to ignore pause events during transition)
  const isAutoAdvancing = useRef(false);

  // Track if we should play when audio is ready (for initial load)
  const shouldPlayWhenReady = useRef(false);

  // Track last seek time from this component to distinguish from external seeks
  const lastLocalSeekTime = useRef<number | null>(null);

  // Sync external seeks (from playlist-player) to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Skip if this was a local seek we just did
    if (lastLocalSeekTime.current !== null && Math.abs(lastLocalSeekTime.current - currentTime) < 0.5) {
      return;
    }

    // Only sync if there's a significant difference (user seeking externally)
    const diff = Math.abs(audio.currentTime - currentTime);
    if (diff > 1) {
      audio.currentTime = currentTime;
    }
  }, [currentTime]);

  // Store callback refs to avoid stale closures in event handlers
  const setCurrentTimeRef = useRef(setCurrentTime);
  const setDurationRef = useRef(setDuration);
  const setIsPlayingRef = useRef(setIsPlaying);
  const onTrackEndedRef = useRef(onTrackEnded);

  // Keep refs up to date
  useEffect(() => {
    setCurrentTimeRef.current = setCurrentTime;
    setDurationRef.current = setDuration;
    setIsPlayingRef.current = setIsPlaying;
    onTrackEndedRef.current = onTrackEnded;
  }, [setCurrentTime, setDuration, setIsPlaying, onTrackEnded]);

  // Audio event handlers - only set up once on mount
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTimeRef.current(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDurationRef.current(audio.duration);
    };
    const handleCanPlay = () => {
      // Auto-play when audio is ready if we're supposed to be playing
      if (shouldPlayWhenReady.current) {
        shouldPlayWhenReady.current = false;
        audio.play().catch(() => setIsPlayingRef.current(false));
      }
    };
    const handleEnded = () => {
      // Mark as auto-advancing so pause event doesn't stop playback
      isAutoAdvancing.current = true;
      onTrackEndedRef.current();
      // Reset flag after a short delay
      setTimeout(() => {
        isAutoAdvancing.current = false;
      }, 100);
    };
    const handlePlay = () => setIsPlayingRef.current(true);
    const handlePause = () => {
      // Don't update state if we're auto-advancing to next track
      if (!isAutoAdvancing.current) {
        setIsPlayingRef.current(false);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []); // Empty deps - only run once on mount

  // Media Session API for lock screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack || !playlist) return;

    const displayTitle = currentTrack.title || `Track ${currentIndex + 1}`;
    const displayArtist = currentTrack.artist || playlist.eventTitle;
    const thumbnailUrl = currentTrack.thumbnail_url || playlist.eventImageUrl;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle,
      artist: displayArtist,
      album: playlist.eventTitle,
      artwork: thumbnailUrl
        ? [
            { src: thumbnailUrl, sizes: "96x96", type: "image/jpeg" },
            { src: thumbnailUrl, sizes: "128x128", type: "image/jpeg" },
            { src: thumbnailUrl, sizes: "256x256", type: "image/jpeg" },
            { src: thumbnailUrl, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", play);
    navigator.mediaSession.setActionHandler("pause", pause);
    navigator.mediaSession.setActionHandler("previoustrack", previous);
    navigator.mediaSession.setActionHandler("nexttrack", next);

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [currentTrack, playlist, currentIndex, play, pause, previous, next]);

  // Handle seek
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = Number(e.target.value);
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = time;
        setCurrentTime(time);
      }
    },
    [setCurrentTime]
  );

  // Navigate to full playlist page
  const handleExpand = useCallback(() => {
    if (playlist) {
      router.push(`/events/${playlist.eventSlug}/playlist`);
    }
  }, [router, playlist]);

  if (!isVisible || !currentTrack) return null;

  const displayTitle = currentTrack.title || `Track ${currentIndex + 1}`;
  const displayArtist = currentTrack.artist || playlist?.eventTitle || "";
  const thumbnailUrl = currentTrack.thumbnail_url || playlist?.eventImageUrl;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Mini player bar - positioned above mobile bottom nav */}
      <div className="fixed left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0">
        {/* Progress bar (thin line at top) */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="container max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3 px-4 py-2">
            {/* Album art & track info (clickable to expand) */}
            <button
              onClick={handleExpand}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={displayTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{displayTitle}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {displayArtist}
                </p>
              </div>
              <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={previous}
                disabled={currentIndex === 0 && currentTime < 3}
              >
                <SkipBack className="w-5 h-5" />
              </Button>

              <Button
                variant="default"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={next}
                disabled={!shuffle && repeatMode === "none" && currentIndex >= tracks.length - 1}
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={close}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Seekable progress bar with repeat/shuffle controls */}
          <div className="px-4 pb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {/* Shuffle button */}
            <button
              onClick={toggleShuffle}
              className={cn(
                "p-1 rounded transition-colors",
                shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Toggle shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <span className="w-10 text-right tabular-nums">
              {formatDuration(Math.floor(currentTime))}
            </span>
            <input
              type="range"
              value={currentTime}
              max={duration || 100}
              step={0.1}
              onChange={handleSeek}
              className="audio-seekbar flex-1 h-1"
            />
            <button
              type="button"
              onClick={() => setShowRemaining(!showRemaining)}
              className="w-10 tabular-nums hover:text-foreground transition-colors"
              aria-label={showRemaining ? "Show total duration" : "Show remaining time"}
            >
              {showRemaining ? `-${formatDuration(Math.floor(duration - currentTime))}` : formatDuration(Math.floor(duration))}
            </button>

            {/* Repeat button */}
            <button
              onClick={toggleRepeat}
              className={cn(
                "p-1 rounded transition-colors",
                repeatMode !== "none" ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={`Repeat: ${repeatMode}`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from being hidden behind the mini player */}
      <div className="h-24 lg:h-28" />
    </>
  );
}
