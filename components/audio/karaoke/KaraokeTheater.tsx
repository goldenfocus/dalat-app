"use client";

import { memo, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, Minus, Plus } from "lucide-react";
import { KaraokeShareButton } from "./KaraokeShareButton";
import { cn } from "@/lib/utils";
import { useCurrentLyricWithContext } from "@/lib/hooks/use-current-lyric";
import {
  useAudioPlayerStore,
  useKaraokeLevel,
  useCurrentTrackLyrics,
  useLyricsOffset,
} from "@/lib/stores/audio-player-store";


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
    setLyricsOffset,
    adjustLyricsOffset,
  } = useAudioPlayerStore();

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

        {/* Timing Controls */}
        <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-white/5">
          <button
            onClick={() => adjustLyricsOffset(-100)}
            className="p-2 text-white/40 hover:text-white transition-colors"
            aria-label="Earlier"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/40 w-24 text-center">
            {lyricsOffset >= 0 ? "+" : ""}{lyricsOffset}ms
          </span>
          <button
            onClick={() => adjustLyricsOffset(100)}
            className="p-2 text-white/40 hover:text-white transition-colors"
            aria-label="Later"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
