"use client";

import { memo, useEffect, useRef, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, RotateCw } from "lucide-react";
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
 * KaraokeTheater - Level 2 karaoke display
 *
 * Bottom sheet (33vh) showing current line with surrounding context.
 * Auto-scrolls to keep current line centered.
 */
export const KaraokeTheater = memo(function KaraokeTheater() {
  const karaokeLevel = useKaraokeLevel();
  const lyricsLrc = useCurrentTrackLyrics();
  const lyricsOffset = useLyricsOffset();
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

  const {
    surroundingLines,
    lineIndex,
    hasLyrics,
    totalLines,
  } = useCurrentLyricWithContext(lyricsLrc, 3, 3, lyricsOffset);

  const {
    setKaraokeLevel,
    adjustLyricsOffset,
    currentTime,
    duration,
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

  // Auto-scroll to current line when it changes
  useEffect(() => {
    if (currentLineRef.current && containerRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [lineIndex]);

  // Don't render if not in theater mode or no lyrics
  if (karaokeLevel !== 2 || !hasLyrics) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom duration-300">
      {/* Backdrop */}
      <div
        className="absolute inset-0 -top-[100vh] bg-black/60 backdrop-blur-sm"
        onClick={() => setKaraokeLevel(1)}
      />

      {/* Theater Container */}
      <div className="relative bg-gradient-to-t from-black via-black/95 to-black/80 border-t border-white/10">
        {/* Header with controls */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          {/* Collapse button */}
          <button
            onClick={() => setKaraokeLevel(1)}
            className="p-2 -ml-2 text-white/60 hover:text-white transition-colors"
            aria-label="Collapse lyrics"
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          {/* Center: Share + Progress */}
          <div className="flex items-center gap-3">
            <KaraokeShareButton mode="theater" className="p-2 bg-transparent" />
            <span className="text-sm text-white/40">
              {lineIndex + 1} / {totalLines}
            </span>
          </div>

          {/* Expand to Hero */}
          <button
            onClick={() => setKaraokeLevel(3)}
            className="p-2 -mr-2 text-white/60 hover:text-white transition-colors"
            aria-label="Full screen"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>

        {/* Lyrics Container */}
        <div
          ref={containerRef}
          className="h-[30vh] overflow-y-auto px-6 py-4 scrollbar-hide"
        >
          <div className="space-y-4 py-8">
            {surroundingLines.map(({ line, index, isCurrent }) => (
              <div
                key={index}
                ref={isCurrent ? currentLineRef : undefined}
                className={cn(
                  "text-center transition-all duration-300",
                  isCurrent
                    ? "text-2xl font-medium text-primary scale-100"
                    : "text-lg text-white/40 scale-95"
                )}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar + Skip controls */}
        <div className="px-4 py-3 border-t border-white/5 space-y-3">
          {/* Clickable progress bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-10 text-right tabular-nums">
              {formatDuration(Math.floor(currentTime))}
            </span>
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-2 transition-all"
            >
              <div
                className="h-full bg-primary transition-all duration-100"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs text-white/40 w-10 tabular-nums">
              {formatDuration(Math.floor(duration || 0))}
            </span>
          </div>

          {/* Skip + Timing controls row */}
          <div className="flex items-center justify-between">
            {/* -15/+15 skip buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => skipBy(-15)}
                className="relative p-2 text-white/50 hover:text-white transition-colors"
                aria-label="Rewind 15 seconds"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-0.5">15</span>
              </button>
              <button
                onClick={() => skipBy(15)}
                className="relative p-2 text-white/50 hover:text-white transition-colors"
                aria-label="Forward 15 seconds"
              >
                <RotateCw className="w-5 h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-0.5">15</span>
              </button>
            </div>

            {/* Timing offset controls */}
            <div className="flex items-center bg-white/5 rounded-full">
              <button
                onClick={() => adjustLyricsOffset(-100)}
                className="flex items-center gap-0.5 pl-2 pr-1 py-1 text-white/50 hover:text-white text-xs transition-colors"
                aria-label="Earlier"
              >
                <ChevronLeft className="w-3 h-3" />
                <span className="text-[10px]">Earlier</span>
              </button>
              <span className="text-[10px] text-white/40 w-10 text-center tabular-nums">
                {lyricsOffset >= 0 ? "+" : ""}{Math.round(lyricsOffset / 100) / 10}s
              </span>
              <button
                onClick={() => adjustLyricsOffset(100)}
                className="flex items-center gap-0.5 pl-1 pr-2 py-1 text-white/50 hover:text-white text-xs transition-colors"
                aria-label="Later"
              >
                <span className="text-[10px]">Later</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
