"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Volume2,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio-metadata";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";

/** Time display with toggle between elapsed/remaining */
function TimeDisplay({ currentTime, duration }: { currentTime: number; duration: number }) {
  const [showRemaining, setShowRemaining] = useState(false);
  const remaining = duration - currentTime;

  return (
    <div className="flex justify-between text-xs text-muted-foreground mt-1">
      <span>{formatDuration(Math.floor(currentTime))}</span>
      <button
        type="button"
        onClick={() => setShowRemaining(!showRemaining)}
        className="hover:text-foreground transition-colors tabular-nums"
        aria-label={showRemaining ? "Show total duration" : "Show remaining time"}
      >
        {showRemaining ? `-${formatDuration(Math.floor(remaining))}` : formatDuration(Math.floor(duration))}
      </button>
    </div>
  );
}

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
  eventSlug: string;
  eventTitle: string;
  eventImageUrl?: string | null;
  className?: string;
}

export function PlaylistPlayer({
  tracks,
  eventSlug,
  eventTitle,
  eventImageUrl,
  className,
}: PlaylistPlayerProps) {
  const t = useTranslations("playlist");

  // Global store state
  const {
    tracks: storeTracks,
    playlist: storePlaylist,
    currentIndex: storeCurrentIndex,
    isPlaying: storeIsPlaying,
    currentTime,
    duration,
    repeatMode,
    shuffle,
    setPlaylist,
    playTrack: storePlayTrack,
    play,
    pause,
    togglePlay,
    next,
    previous,
    seekTo,
    toggleRepeat,
    toggleShuffle,
  } = useAudioPlayerStore();

  // Check if this playlist is currently active in the global player
  const isThisPlaylistActive = useMemo(
    () => storePlaylist?.eventSlug === eventSlug && storeTracks.length > 0,
    [storePlaylist?.eventSlug, eventSlug, storeTracks.length]
  );

  // Get current state - either from store (if this playlist) or local defaults
  const currentIndex = isThisPlaylistActive ? storeCurrentIndex : 0;
  const isPlaying = isThisPlaylistActive ? storeIsPlaying : false;

  const currentTrack = tracks[currentIndex];
  const displayTitle = currentTrack?.title || `Track ${currentIndex + 1}`;
  const displayArtist = currentTrack?.artist || eventTitle;
  const thumbnailUrl = currentTrack?.thumbnail_url || eventImageUrl;

  // Calculate total playlist duration
  const totalDuration = tracks.reduce(
    (acc, track) => acc + (track.duration_seconds || 0),
    0
  );

  // Start playing this playlist (sets it in global store)
  const startPlaylist = useCallback(
    (startIndex = 0) => {
      // Convert tracks to store format
      const audioTracks = tracks.map((t) => ({
        id: t.id,
        file_url: t.file_url,
        title: t.title,
        artist: t.artist,
        album: t.album,
        thumbnail_url: t.thumbnail_url,
        duration_seconds: t.duration_seconds,
      }));

      setPlaylist(
        audioTracks,
        { eventSlug, eventTitle, eventImageUrl: eventImageUrl || null },
        startIndex
      );
    },
    [tracks, eventSlug, eventTitle, eventImageUrl, setPlaylist]
  );

  // Handle track click
  const handleTrackClick = useCallback(
    (index: number) => {
      if (isThisPlaylistActive) {
        // Already playing this playlist, just change track
        storePlayTrack(index);
      } else {
        // Start this playlist from the clicked track
        startPlaylist(index);
      }
    },
    [isThisPlaylistActive, storePlayTrack, startPlaylist]
  );

  // Handle main play button
  const handleMainPlayClick = useCallback(() => {
    if (isThisPlaylistActive) {
      togglePlay();
    } else {
      startPlaylist(0);
    }
  }, [isThisPlaylistActive, togglePlay, startPlaylist]);

  // Handle seek (only works if this playlist is active)
  const handleSeek = useCallback(
    (time: number) => {
      if (isThisPlaylistActive) {
        seekTo(time);
      }
    },
    [isThisPlaylistActive, seekTo]
  );

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
              <p className="text-xs text-muted-foreground mb-1">
                {isPlaying ? t("nowPlaying") : t("upNext")}
              </p>
              <h3 className="font-semibold text-lg truncate">{displayTitle}</h3>
              <p className="text-muted-foreground truncate">{displayArtist}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("trackOf", { current: currentIndex + 1, total: tracks.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar (only interactive if this playlist is active) */}
        <div className="px-6 pb-2">
          <input
            type="range"
            value={isThisPlaylistActive ? currentTime : 0}
            max={isThisPlaylistActive && duration ? duration : currentTrack?.duration_seconds || 100}
            step={0.1}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="audio-seekbar w-full h-2"
            disabled={!isThisPlaylistActive}
          />
          <TimeDisplay
            currentTime={isThisPlaylistActive ? currentTime : 0}
            duration={isThisPlaylistActive && duration ? duration : currentTrack?.duration_seconds || 0}
          />
        </div>

        {/* Controls */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-center gap-2">
            {/* Shuffle button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleShuffle}
              className={cn(
                "w-10 h-10",
                shuffle ? "text-primary" : "text-muted-foreground"
              )}
              aria-label="Toggle shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => isThisPlaylistActive ? previous() : handleTrackClick(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0 && !shuffle && repeatMode === "none"}
              className="w-12 h-12"
              aria-label={t("previous")}
            >
              <SkipBack className="w-6 h-6" />
            </Button>

            <Button
              size="icon"
              onClick={handleMainPlayClick}
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
              onClick={() => isThisPlaylistActive ? next() : handleTrackClick(Math.min(tracks.length - 1, currentIndex + 1))}
              disabled={!shuffle && repeatMode === "none" && currentIndex === tracks.length - 1}
              className="w-12 h-12"
              aria-label={t("next")}
            >
              <SkipForward className="w-6 h-6" />
            </Button>

            {/* Repeat button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRepeat}
              className={cn(
                "w-10 h-10",
                repeatMode !== "none" ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={`Repeat: ${repeatMode}`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{t("upNext")}</h4>
            <span className="text-sm text-muted-foreground">
              {t("tracks", { count: tracks.length })} &middot;{" "}
              {Math.round(totalDuration / 60)} {t("totalDuration", { minutes: "" }).trim()}
            </span>
          </div>
        </div>
        <div className="divide-y max-h-[400px] overflow-y-auto">
          {tracks.map((track, index) => (
            <button
              key={track.id}
              type="button"
              onClick={() => handleTrackClick(index)}
              className={cn(
                "w-full flex items-center gap-3 p-3 text-left transition-colors",
                "hover:bg-accent active:bg-accent/80",
                isThisPlaylistActive && index === currentIndex && "bg-primary/5"
              )}
            >
              {/* Track Number / Playing Indicator */}
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                {isThisPlaylistActive && index === currentIndex && isPlaying ? (
                  <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                ) : (
                  <span
                    className={cn(
                      "text-sm",
                      isThisPlaylistActive && index === currentIndex
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    )}
                  >
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
                <p
                  className={cn(
                    "font-medium text-sm truncate",
                    isThisPlaylistActive && index === currentIndex && "text-primary"
                  )}
                >
                  {track.title || `Track ${index + 1}`}
                </p>
                {track.artist && (
                  <p className="text-xs text-muted-foreground truncate">
                    {track.artist}
                  </p>
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
