"use client";

import { useEffect, useCallback, useState } from "react";
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
  Volume2,
  Volume1,
  VolumeX,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio-metadata";
import {
  useAudioPlayerStore,
  useCurrentTrack,
  useIsPlayerVisible,
  useKaraokeLevel,
  useAutoplayBlocked,
  useVolume,
  useIsMuted,
} from "@/lib/stores/audio-player-store";
import {
  KaraokeFooterLine,
  KaraokeToggleButton,
  KaraokeTheater,
  KaraokeHero,
} from "./karaoke";

export function MiniPlayer() {
  const router = useRouter();

  const isVisible = useIsPlayerVisible();
  const currentTrack = useCurrentTrack();
  const autoplayBlocked = useAutoplayBlocked();
  const volume = useVolume();
  const isMuted = useIsMuted();

  const karaokeLevel = useKaraokeLevel();

  const {
    tracks,
    playlist,
    currentIndex,
    audioElement,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    repeatMode,
    shuffle,
    setAudioElement,
    togglePlay,
    next,
    previous,
    seek,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    toggleRepeat,
    toggleShuffle,
    setVolume,
    toggleMute,
    close,
  } = useAudioPlayerStore();

  // UI state
  const [showRemaining, setShowRemaining] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Initialize audio element ONCE and store in Zustand
  useEffect(() => {
    if (audioElement) return; // Already initialized

    const audio = new Audio();
    audio.preload = "metadata";

    // Set up event listeners ONCE
    audio.addEventListener("loadedmetadata", () => {
      const dur = audio.duration;
      if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
        useAudioPlayerStore.getState().setDuration(dur);
      }
    });

    audio.addEventListener("durationchange", () => {
      const dur = audio.duration;
      if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
        useAudioPlayerStore.getState().setDuration(dur);
      }
    });

    audio.addEventListener("timeupdate", () => {
      useAudioPlayerStore.getState().setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      const state = useAudioPlayerStore.getState();

      if (state.repeatMode === "one") {
        // Repeat single track
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        // Go to next track (store's next() handles looping logic)
        state.next();
      }
    });

    audio.addEventListener("play", () => {
      useAudioPlayerStore.getState().setIsPlaying(true);
    });

    audio.addEventListener("pause", () => {
      useAudioPlayerStore.getState().setIsPlaying(false);
    });

    audio.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      useAudioPlayerStore.getState().setIsPlaying(false);
      useAudioPlayerStore.getState().setIsLoading(false);
    });

    // Store the audio element
    setAudioElement(audio);

    return () => {
      // Don't clean up - audio element persists
    };
  }, [audioElement, setAudioElement]);

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

    const store = useAudioPlayerStore.getState();
    navigator.mediaSession.setActionHandler("play", () => store.play());
    navigator.mediaSession.setActionHandler("pause", () => store.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => store.previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => store.next());

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [currentTrack, playlist, currentIndex]);

  // Handle seek from slider
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = Number(e.target.value);
      seek(time);
    },
    [seek]
  );

  // Expand to karaoke Theater mode when clicking track info
  const handleExpandToTheater = useCallback(() => {
    const { setKaraokeLevel, karaokeEnabled } = useAudioPlayerStore.getState();
    if (karaokeEnabled && currentTrack?.lyrics_lrc) {
      // Expand to Theater mode (Level 2)
      setKaraokeLevel(2);
    } else if (playlist) {
      // Fallback: navigate to playlist page if no lyrics
      router.push(`/events/${playlist.eventSlug}/playlist`);
    }
  }, [router, playlist, currentTrack?.lyrics_lrc]);

  // Download current track
  const handleDownload = useCallback(async () => {
    if (!currentTrack?.file_url || isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch the audio file as blob to ensure download works cross-origin
      const response = await fetch(currentTrack.file_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Generate filename from track title or fallback
      const filename = currentTrack.title
        ? `${currentTrack.title}.mp3`
        : `track-${currentIndex + 1}.mp3`;

      // Create temporary link and trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up object URL
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  }, [currentTrack?.file_url, currentTrack?.title, currentIndex, isDownloading]);

  if (!isVisible || !currentTrack) return null;

  const displayTitle = currentTrack.title || `Track ${currentIndex + 1}`;
  const displayArtist = currentTrack.artist || playlist?.eventTitle || "";
  const thumbnailUrl = currentTrack.thumbnail_url || playlist?.eventImageUrl;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mini player bar - positioned above mobile bottom nav */}
      <div className="fixed left-0 right-0 z-[60] bg-background/95 backdrop-blur-lg border-t bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0">
        {/* Progress bar (thin line at top) */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="container max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3 px-4 py-2">
            {/* Album art & track info (clickable to expand to Theater karaoke) */}
            <button
              onClick={handleExpandToTheater}
              className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform"
              aria-label={currentTrack?.lyrics_lrc ? "Expand to karaoke" : "Go to playlist"}
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

              <div className="relative">
                {/* Pulsing ring when autoplay blocked */}
                {autoplayBlocked && !isPlaying && (
                  <div className="absolute inset-0 rounded-full animate-ping bg-primary/40" />
                )}
                <Button
                  variant="default"
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-full relative",
                    autoplayBlocked && !isPlaying && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                  onClick={togglePlay}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </Button>
              </div>

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

            {/* Karaoke toggle button */}
            <KaraokeToggleButton />

            {/* Volume control */}
            <div
              className="relative"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </Button>

              {/* Volume slider popup */}
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-popover border rounded-lg shadow-lg">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value);
                      setVolume(newVolume);
                      // Unmute if adjusting volume while muted
                      if (isMuted && newVolume > 0) {
                        toggleMute();
                      }
                    }}
                    className="w-24 h-1 accent-primary cursor-pointer"
                    aria-label="Volume"
                  />
                </div>
              )}
            </div>

            {/* Download button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleDownload}
              disabled={isDownloading || !currentTrack?.file_url}
              aria-label="Download track"
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </Button>

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

          {/* Karaoke lyrics line (Level 1) */}
          {karaokeLevel >= 1 && <KaraokeFooterLine />}

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
              {showRemaining
                ? `-${formatDuration(Math.floor(duration - currentTime))}`
                : formatDuration(Math.floor(duration))}
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

      {/* Karaoke overlays - Level 2 (Theater) and Level 3 (Hero) */}
      <KaraokeTheater />
      <KaraokeHero />
    </>
  );
}
