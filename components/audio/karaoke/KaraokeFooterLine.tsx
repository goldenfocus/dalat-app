"use client";

import { memo, useCallback } from "react";
import { ChevronUp, Mic2, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentLineText } from "@/lib/hooks/use-current-lyric";
import {
  useAudioPlayerStore,
  useKaraokeEnabled,
  useKaraokeLevel,
  useCurrentTrackLyrics,
  useLyricsOffset,
} from "@/lib/stores/audio-player-store";

/**
 * KaraokeFooterLine - Level 1 karaoke display
 *
 * Shows the current lyric line in the mini-player footer.
 * Tapping expands to Level 2 (Theater mode).
 */
export const KaraokeFooterLine = memo(function KaraokeFooterLine() {
  const karaokeEnabled = useKaraokeEnabled();
  const karaokeLevel = useKaraokeLevel();
  const lyricsLrc = useCurrentTrackLyrics();
  const lyricsOffset = useLyricsOffset();

  const { text: currentText, nextText, hasLyrics } = useCurrentLineText(
    lyricsLrc,
    lyricsOffset
  );

  const { setKaraokeLevel, toggleKaraoke } = useAudioPlayerStore();

  // Handle tap to expand to Theater mode (Level 2)
  const handleExpand = useCallback(() => {
    if (karaokeLevel < 2) {
      setKaraokeLevel(2);
    }
  }, [karaokeLevel, setKaraokeLevel]);

  // If karaoke is disabled or no lyrics, show toggle button
  if (!karaokeEnabled || !hasLyrics) {
    return (
      <button
        onClick={toggleKaraoke}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2",
          "text-xs text-muted-foreground transition-colors",
          hasLyrics ? "hover:text-foreground" : "opacity-50 cursor-not-allowed"
        )}
        disabled={!hasLyrics}
        aria-label={hasLyrics ? "Show lyrics" : "No lyrics available"}
      >
        {hasLyrics ? (
          <>
            <MicOff className="w-3.5 h-3.5" />
            <span>Show lyrics</span>
          </>
        ) : (
          <span>No lyrics</span>
        )}
      </button>
    );
  }

  // Level 0: Closed - don't show anything (but we got here because enabled is true)
  if (karaokeLevel === 0) {
    return (
      <button
        onClick={() => setKaraokeLevel(1)}
        className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Show lyrics"
      >
        <Mic2 className="w-3.5 h-3.5" />
        <span>Show lyrics</span>
      </button>
    );
  }

  // Level 1: Footer - show current line
  return (
    <button
      onClick={handleExpand}
      className="w-full px-4 py-2 text-center border-t border-border/50 hover:bg-muted/30 transition-colors group"
      aria-label="Expand lyrics"
    >
      <div className="flex items-center justify-center gap-2">
        {/* Current lyric line */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {currentText ? (
            <p className="text-sm font-medium text-foreground truncate animate-in fade-in duration-300">
              {currentText}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              ...
            </p>
          )}
          {/* Next line preview (dimmed) */}
          {nextText && (
            <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
              {nextText}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
      </div>
    </button>
  );
});

/**
 * Karaoke toggle button for the mini-player controls area.
 * Shows mic icon and toggles karaoke on/off.
 */
export const KaraokeToggleButton = memo(function KaraokeToggleButton() {
  const karaokeEnabled = useKaraokeEnabled();
  const lyricsLrc = useCurrentTrackLyrics();
  const { toggleKaraoke } = useAudioPlayerStore();

  // Only show if there are lyrics
  if (!lyricsLrc) return null;

  return (
    <button
      onClick={toggleKaraoke}
      className={cn(
        "p-2 rounded-lg transition-colors",
        karaokeEnabled
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground"
      )}
      aria-label={karaokeEnabled ? "Hide lyrics" : "Show lyrics"}
    >
      {karaokeEnabled ? (
        <Mic2 className="w-4 h-4" />
      ) : (
        <MicOff className="w-4 h-4" />
      )}
    </button>
  );
});
