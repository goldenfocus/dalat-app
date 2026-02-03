"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Volume2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio-metadata";

export interface PlaylistTrack {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
}

export interface PlaylistPlayerProps {
  tracks: PlaylistTrack[];
  eventTitle: string;
  eventImageUrl?: string | null;
  className?: string;
}

export function PlaylistPlayer({
  tracks,
  eventTitle,
  eventImageUrl,
  className,
}: PlaylistPlayerProps) {
  const t = useTranslations("playlist");
  const audioRef = useRef<HTMLAudioElement>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userPaused, setUserPaused] = useState(false);

  const currentTrack = tracks[currentIndex];
  const displayTitle = currentTrack?.title || `Track ${currentIndex + 1}`;
  const displayArtist = currentTrack?.artist || eventTitle;
  const thumbnailUrl = currentTrack?.thumbnail_url || eventImageUrl;

  // Calculate total playlist duration
  const totalDuration = tracks.reduce((acc, track) => acc + (track.duration_seconds || 0), 0);

  // Play a specific track
  const playTrack = useCallback((index: number) => {
    if (index >= 0 && index < tracks.length) {
      setCurrentIndex(index);
      setUserPaused(false);
      // Audio will auto-play when src changes due to useEffect below
    }
  }, [tracks.length]);

  // Play previous track
  const playPrevious = useCallback(() => {
    if (currentIndex > 0) {
      playTrack(currentIndex - 1);
    }
  }, [currentIndex, playTrack]);

  // Play next track
  const playNext = useCallback(() => {
    if (currentIndex < tracks.length - 1) {
      playTrack(currentIndex + 1);
    }
  }, [currentIndex, tracks.length, playTrack]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setUserPaused(true);
    } else {
      audio.play().catch(() => {});
      setUserPaused(false);
    }
  }, [isPlaying]);

  // Seek to position
  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  // Set up Media Session API for background playback and lock screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const audio = audioRef.current;
    if (!audio) return;

    // Update Media Session metadata
    const updateMediaSession = () => {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle,
        artist: displayArtist,
        album: eventTitle,
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
        setUserPaused(false);
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        audio.pause();
        setUserPaused(true);
      });

      navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
      navigator.mediaSession.setActionHandler("nexttrack", playNext);

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

    // Update position state for lock screen progress bar
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

    // Event listeners
    const handlePlay = () => {
      setIsPlaying(true);
      updateMediaSession();
      setupActionHandlers();
      navigator.mediaSession.playbackState = "playing";
    };

    const handlePause = () => {
      setIsPlaying(false);
      navigator.mediaSession.playbackState = "paused";
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updatePositionState();
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      updatePositionState();
    };

    const handleEnded = () => {
      // Auto-advance to next track
      if (currentIndex < tracks.length - 1) {
        playNext();
      } else {
        setIsPlaying(false);
      }
    };

    // Handle visibility change (screen lock/unlock)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !audio.paused && !audio.ended) {
        audio.play().catch(() => {});
      } else if (document.visibilityState === "visible" && !userPaused && audio.paused && !audio.ended) {
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initialize media session
    updateMediaSession();
    setupActionHandlers();

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Clear action handlers on unmount
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("seekto", null);
      }
    };
  }, [displayTitle, displayArtist, eventTitle, thumbnailUrl, currentIndex, tracks.length, playPrevious, playNext, userPaused]);

  // Auto-play when track changes (after first user interaction)
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !userPaused && currentIndex > 0) {
      audio.play().catch(() => {});
    }
  }, [currentIndex, userPaused]);

  if (tracks.length === 0) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground", className)}>
        <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t("noAudioFiles")}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Player Card */}
      <div className="bg-card border rounded-xl overflow-hidden">
        {/* Album Art & Track Info */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            {/* Album Art */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={displayTitle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-10 h-10 text-primary" />
              )}
            </div>

            {/* Track Info */}
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-xs text-muted-foreground mb-1">{t("nowPlaying")}</p>
              <h3 className="font-semibold text-lg truncate">{displayTitle}</h3>
              <p className="text-muted-foreground truncate">{displayArtist}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("trackOf", { current: currentIndex + 1, total: tracks.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pb-2">
          <input
            type="range"
            value={currentTime}
            max={duration || 100}
            step={1}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatDuration(Math.floor(currentTime))}</span>
            <span>{formatDuration(Math.floor(duration))}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={playPrevious}
              disabled={currentIndex === 0}
              className="w-12 h-12"
              aria-label={t("previous")}
            >
              <SkipBack className="w-6 h-6" />
            </Button>

            <Button
              size="icon"
              onClick={togglePlay}
              className="w-16 h-16 rounded-full"
              aria-label={isPlaying ? t("pause") : t("play")}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={playNext}
              disabled={currentIndex === tracks.length - 1}
              className="w-12 h-12"
              aria-label={t("next")}
            >
              <SkipForward className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={currentTrack?.file_url}
          playsInline
          preload="auto"
        />
      </div>

      {/* Track List */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{t("upNext")}</h4>
            <span className="text-sm text-muted-foreground">
              {t("tracks", { count: tracks.length })} &middot; {Math.round(totalDuration / 60)} {t("totalDuration", { minutes: "" }).trim()}
            </span>
          </div>
        </div>
        <div className="divide-y max-h-[400px] overflow-y-auto">
          {tracks.map((track, index) => (
            <button
              key={track.id}
              type="button"
              onClick={() => playTrack(index)}
              className={cn(
                "w-full flex items-center gap-3 p-3 text-left transition-colors",
                "hover:bg-accent active:bg-accent/80",
                index === currentIndex && "bg-primary/5"
              )}
            >
              {/* Track Number / Playing Indicator */}
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                {index === currentIndex && isPlaying ? (
                  <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                ) : (
                  <span className={cn(
                    "text-sm",
                    index === currentIndex ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {index + 1}
                  </span>
                )}
              </div>

              {/* Track Thumbnail */}
              <div className="w-10 h-10 flex-shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                {track.thumbnail_url ? (
                  <img
                    src={track.thumbnail_url}
                    alt={track.title || "Track"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-medium text-sm truncate",
                  index === currentIndex && "text-primary"
                )}>
                  {track.title || `Track ${index + 1}`}
                </p>
                {track.artist && (
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                )}
              </div>

              {/* Duration */}
              {track.duration_seconds && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDuration(track.duration_seconds)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
