"use client";

import { memo, useMemo, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Minus,
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { KaraokeShareButton } from "./KaraokeShareButton";
import { cn } from "@/lib/utils";
import { useCurrentLyricWithContext } from "@/lib/hooks/use-current-lyric";
import {
  useAudioPlayerStore,
  useKaraokeLevel,
  useCurrentTrackLyrics,
  useLyricsOffset,
} from "@/lib/stores/audio-player-store";
import { formatDuration } from "@/lib/audio-metadata";

/**
 * Large word-by-word highlighting for hero mode.
 */
function HeroHighlightedLine({
  text,
  progress,
  isCurrent,
}: {
  text: string;
  progress: number;
  isCurrent: boolean;
}) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  if (!isCurrent) {
    return <span>{text}</span>;
  }

  const activeWordIndex = Math.floor(progress * words.length);

  return (
    <span className="inline">
      {words.map((word, index) => {
        const isCompleted = index < activeWordIndex;
        const isActive = index === activeWordIndex;

        return (
          <span key={index}>
            <span
              className={cn(
                "transition-all duration-200",
                isCompleted && "text-primary drop-shadow-glow",
                isActive && "text-primary font-bold scale-110 inline-block drop-shadow-glow-strong",
                !isCompleted && !isActive && "text-white/50"
              )}
            >
              {word}
            </span>
            {index < words.length - 1 && " "}
          </span>
        );
      })}
    </span>
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
    progress,
    hasLyrics,
    totalLines,
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
    adjustLyricsOffset,
  } = useAudioPlayerStore();

  const currentTrack = tracks[currentIndex];

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
      {/* Background gradient animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-black to-purple-900/20 animate-pulse-slow" />

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
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <button
              onClick={() => adjustLyricsOffset(-100)}
              className="p-1 text-white/60 hover:text-white"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/60 w-16 text-center">
              {lyricsOffset >= 0 ? "+" : ""}{lyricsOffset}ms
            </span>
            <button
              onClick={() => adjustLyricsOffset(100)}
              className="p-1 text-white/60 hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main lyrics area */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex flex-col items-center justify-center px-8"
        onClick={() => setShowControls(!showControls)}
      >
        <div className="space-y-6 max-w-4xl mx-auto text-center">
          {surroundingLines.map(({ line, index, isCurrent }) => (
            <div
              key={index}
              className={cn(
                "transition-all duration-500",
                isCurrent
                  ? "text-4xl sm:text-5xl md:text-6xl font-bold text-white"
                  : "text-xl sm:text-2xl md:text-3xl text-white/30"
              )}
            >
              <HeroHighlightedLine
                text={line.text}
                progress={progress}
                isCurrent={isCurrent}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom playback controls */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 p-6 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar */}
        <div className="max-w-2xl mx-auto mb-4">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/50 mt-1">
            <span>{formatDuration(Math.floor(currentTime))}</span>
            <span>{lineIndex + 1} / {totalLines}</span>
            <span>{formatDuration(Math.floor(duration || 0))}</span>
          </div>
        </div>

        {/* Playback buttons */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={previous}
            className="p-3 text-white/60 hover:text-white transition-colors"
            aria-label="Previous"
          >
            <SkipBack className="w-8 h-8" />
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

          <button
            onClick={next}
            className="p-3 text-white/60 hover:text-white transition-colors"
            aria-label="Next"
          >
            <SkipForward className="w-8 h-8" />
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
