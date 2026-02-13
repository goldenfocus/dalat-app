"use client";

import { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Save,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { KaraokeShareButton } from "./KaraokeShareButton";
import {
  KaraokeCountdown,
  FloatingNotes,
  PulseBackground,
  InstrumentalBreak,
  KaraokeBackgroundSlideshow,
  KaraokeStyles,
} from "./KaraokeVisuals";
import { cn } from "@/lib/utils";
import { useCurrentLyricWithContext } from "@/lib/hooks/use-current-lyric";
import {
  useAudioPlayerStore,
  useKaraokeLevel,
  useCurrentTrackLyrics,
  useLyricsOffset,
  useCurrentTrack,
} from "@/lib/stores/audio-player-store";
import { formatDuration } from "@/lib/audio-metadata";
import { createClient } from "@/lib/supabase/client";

/**
 * Timing controls with clearer labels and admin save option.
 */
function TimingControls() {
  const lyricsOffset = useLyricsOffset();
  const { adjustLyricsOffset } = useAudioPlayerStore();
  const currentTrack = useCurrentTrack();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOffset, setSavedOffset] = useState<number | null>(null);

  // Check admin status on mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .single();

        setIsAdmin(!!profile?.is_admin);
      } catch {
        // Silently fail - not admin
      }
    };
    checkAdmin();
  }, []);

  // Track the original saved offset when track changes
  useEffect(() => {
    if (currentTrack?.timing_offset !== undefined) {
      setSavedOffset(currentTrack.timing_offset);
    }
  }, [currentTrack?.id, currentTrack?.timing_offset]);

  // Check if offset has changed from saved value
  const hasUnsavedChanges = savedOffset !== null && lyricsOffset !== savedOffset;

  const handleSave = useCallback(async () => {
    if (!currentTrack?.id || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/karaoke/timing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: currentTrack.id,
          timingOffset: lyricsOffset,
        }),
      });

      if (response.ok) {
        setSavedOffset(lyricsOffset);
      }
    } catch (error) {
      console.error("Failed to save timing:", error);
    } finally {
      setIsSaving(false);
    }
  }, [currentTrack?.id, lyricsOffset, isSaving]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-white/10 rounded-full">
        {/* Earlier button (negative = lyrics show sooner) */}
        <button
          onClick={() => adjustLyricsOffset(-100)}
          className="flex items-center gap-0.5 pl-3 pr-1 py-1.5 text-white/70 hover:text-white text-xs transition-colors"
          title="Show lyrics earlier (teleprompter mode)"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Earlier</span>
        </button>

        {/* Current offset display */}
        <span className="text-xs text-white/50 w-12 text-center tabular-nums">
          {lyricsOffset >= 0 ? "+" : ""}{Math.round(lyricsOffset / 100) / 10}s
        </span>

        {/* Later button (positive = lyrics show later) */}
        <button
          onClick={() => adjustLyricsOffset(100)}
          className="flex items-center gap-0.5 pl-1 pr-3 py-1.5 text-white/70 hover:text-white text-xs transition-colors"
          title="Show lyrics later"
        >
          <span className="hidden sm:inline">Later</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Admin save button */}
      {isAdmin && hasUnsavedChanges && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-full text-xs transition-all",
            isSaving
              ? "bg-white/5 text-white/30"
              : "bg-primary/80 text-white hover:bg-primary"
          )}
          title="Save timing for all users"
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">Save</span>
        </button>
      )}
    </div>
  );
}


/**
 * KaraokeHero - Level 3 full-screen immersive karaoke
 *
 * Full-screen with large text, visual effects, and playback controls.
 * Designed for karaoke sessions and sing-alongs.
 */
export const KaraokeHero = memo(function KaraokeHero() {
  const karaokeLevel = useKaraokeLevel();
  const lyricsLrc = useCurrentTrackLyrics();
  const lyricsOffset = useLyricsOffset();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);

  const {
    surroundingLines,
    lineIndex,
    hasLyrics,
    totalLines,
    parsed,
  } = useCurrentLyricWithContext(lyricsLrc, 2, 3, lyricsOffset);

  const {
    tracks,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    previous,
    setKaraokeLevel,
    seek,
  } = useAudioPlayerStore();

  const progressBarRef = useRef<HTMLDivElement>(null);

  // Handle progress bar click to seek
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    seek(Math.max(0, Math.min(duration, newTime)));
  }, [duration, seek]);

  // Skip forward/backward by seconds
  const skipBy = useCallback((seconds: number) => {
    if (!duration) return;
    const newTime = currentTime + seconds;
    seek(Math.max(0, Math.min(duration, newTime)));
  }, [currentTime, duration, seek]);

  const currentTrack = tracks[currentIndex];

  // Calculate time until first lyric (for countdown)
  const firstLyricTime = parsed?.lines[0]?.time ?? 0;
  const secondsUntilFirst = firstLyricTime - currentTime - (lyricsOffset / 1000);

  // Detect if we're in intro (before first lyric) or instrumental (gap between lyrics)
  const isInIntro = lineIndex === -1 && currentTime < firstLyricTime;
  const isInInstrumental = lineIndex >= 0 && surroundingLines.length === 0;

  // Get next lyric preview for instrumental breaks
  const nextLyricPreview = parsed?.lines[lineIndex + 1]?.text;

  // Auto-hide controls after inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleInteraction = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 4000);
    };

    handleInteraction();
    window.addEventListener("mousemove", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  // Don't render if not in hero mode or no lyrics
  if (karaokeLevel !== 3 || !hasLyrics) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden animate-in fade-in duration-300">
      {/* Inject animation styles */}
      <KaraokeStyles />

      {/* Background image slideshow (subtle, behind everything) */}
      <KaraokeBackgroundSlideshow />

      {/* Background gradient animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-black to-purple-900/20 animate-pulse-slow" />

      {/* Audio-reactive pulse */}
      <PulseBackground isPlaying={isPlaying} />

      {/* Floating music notes */}
      <FloatingNotes count={12} />

      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-5 bg-[url('/noise.png')] bg-repeat" />

      {/* Top controls */}
      <div
        className={cn(
          "absolute top-0 inset-x-0 p-4 flex items-center justify-between transition-opacity duration-300 z-10",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setKaraokeLevel(2)}
          className="p-3 bg-white/10 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-all"
          aria-label="Exit full screen"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        {/* Track info */}
        <div className="text-center">
          <p className="text-white/90 font-medium truncate max-w-[200px]">
            {currentTrack?.title || "Unknown"}
          </p>
          <p className="text-white/50 text-sm truncate max-w-[200px]">
            {currentTrack?.artist || ""}
          </p>
        </div>

        {/* Share + Timing controls */}
        <div className="flex items-center gap-2">
          <KaraokeShareButton mode="hero" />
          <TimingControls />
        </div>
      </div>

      {/* Main lyrics area */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex flex-col items-center justify-center px-8"
        onClick={() => setShowControls(!showControls)}
      >
        {/* Show countdown during intro */}
        {(isInIntro || (!isPlaying && lineIndex === -1)) && (
          <KaraokeCountdown
            secondsUntilFirst={secondsUntilFirst}
            isPlaying={isPlaying}
          />
        )}

        {/* Show instrumental break indicator */}
        {isInInstrumental && isPlaying && (
          <InstrumentalBreak nextLyricPreview={nextLyricPreview} />
        )}

        {/* Show lyrics when we have them */}
        {!isInIntro && !isInInstrumental && surroundingLines.length > 0 && (
          <div className="space-y-6 max-w-4xl mx-auto text-center">
            {surroundingLines.map(({ line, index, isCurrent }) => (
              <div
                key={index}
                className={cn(
                  "transition-all duration-500",
                  isCurrent
                    ? "text-4xl sm:text-5xl md:text-6xl font-bold text-primary drop-shadow-glow-strong"
                    : "text-xl sm:text-2xl md:text-3xl text-white/30"
                )}
              >
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom playback controls */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 p-6 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar - clickable */}
        <div className="max-w-2xl mx-auto mb-4">
          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            className="h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-3 transition-all group"
          >
            <div
              className="h-full bg-primary transition-all duration-100 group-hover:bg-primary/90"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/50 mt-1">
            <span>{formatDuration(Math.floor(currentTime))}</span>
            <span>{lineIndex + 1} / {totalLines}</span>
            <span>{formatDuration(Math.floor(duration || 0))}</span>
          </div>
        </div>

        {/* Playback buttons with -15/+15 skip */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={previous}
            className="p-3 text-white/60 hover:text-white transition-colors"
            aria-label="Previous track"
          >
            <SkipBack className="w-7 h-7" />
          </button>

          {/* -15 seconds */}
          <button
            onClick={() => skipBy(-15)}
            className="relative p-2 text-white/60 hover:text-white transition-colors"
            aria-label="Rewind 15 seconds"
          >
            <RotateCcw className="w-7 h-7" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold mt-0.5">15</span>
          </button>

          <button
            onClick={togglePlay}
            className="p-5 bg-primary rounded-full text-primary-foreground hover:bg-primary/90 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-10 h-10" />
            ) : (
              <Play className="w-10 h-10 ml-1" />
            )}
          </button>

          {/* +15 seconds */}
          <button
            onClick={() => skipBy(15)}
            className="relative p-2 text-white/60 hover:text-white transition-colors"
            aria-label="Forward 15 seconds"
          >
            <RotateCw className="w-7 h-7" />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold mt-0.5">15</span>
          </button>

          <button
            onClick={next}
            className="p-3 text-white/60 hover:text-white transition-colors"
            aria-label="Next track"
          >
            <SkipForward className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* Custom styles for glow effects */}
      <style jsx global>{`
        .drop-shadow-glow {
          filter: drop-shadow(0 0 8px hsl(var(--primary) / 0.5));
        }
        .drop-shadow-glow-strong {
          filter: drop-shadow(0 0 16px hsl(var(--primary) / 0.8));
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
});
