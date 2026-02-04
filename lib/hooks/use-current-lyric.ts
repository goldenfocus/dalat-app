/**
 * useCurrentLyric Hook
 *
 * Connects to the audio player store and provides real-time
 * lyric synchronization for karaoke display.
 */

import { useMemo } from 'react';
import { useAudioPlayerStore } from '@/lib/stores/audio-player-store';
import {
  parseLrc,
  getCurrentLyricState,
  getSurroundingLines,
} from '@/lib/karaoke/lrc-parser';
import type { ParsedLrc, CurrentLyricState, LrcLine } from '@/lib/types/karaoke';
import { DEFAULT_LYRICS_OFFSET } from '@/lib/types/karaoke';

/**
 * Hook to get the current lyric state synchronized with audio playback.
 *
 * @param lrcContent - Raw LRC string content, or null if no lyrics
 * @param offset - Timing offset in milliseconds (default: -800ms)
 * @returns Current lyric state with line, word index, and progress
 *
 * @example
 * ```tsx
 * const { currentLine, lineIndex, wordIndex } = useCurrentLyric(lrcContent);
 *
 * if (currentLine) {
 *   return <div className="lyric-line">{currentLine.text}</div>;
 * }
 * ```
 */
export function useCurrentLyric(
  lrcContent: string | null,
  offset: number = DEFAULT_LYRICS_OFFSET
): CurrentLyricState & {
  parsed: ParsedLrc | null;
  totalLines: number;
  hasLyrics: boolean;
} {
  // Subscribe to currentTime from audio player (updates ~4x/sec)
  const currentTime = useAudioPlayerStore((state) => state.currentTime);

  // Parse LRC content (memoized, only re-parses when content changes)
  const parsed = useMemo(() => {
    if (!lrcContent) return null;
    try {
      return parseLrc(lrcContent);
    } catch (error) {
      console.error('Failed to parse LRC content:', error);
      return null;
    }
  }, [lrcContent]);

  // Get current lyric state (memoized based on time and parsed content)
  const state = useMemo(() => {
    return getCurrentLyricState(parsed, currentTime, offset);
  }, [parsed, currentTime, offset]);

  return {
    ...state,
    parsed,
    totalLines: parsed?.lines.length ?? 0,
    hasLyrics: parsed !== null && parsed.lines.length > 0,
  };
}

/**
 * Hook to get the current lyric with surrounding lines for Theater/Hero modes.
 *
 * @param lrcContent - Raw LRC string content
 * @param before - Number of lines to show before current (default: 2)
 * @param after - Number of lines to show after current (default: 2)
 * @param offset - Timing offset in milliseconds
 * @returns Current state plus surrounding lines array
 *
 * @example
 * ```tsx
 * const { surroundingLines, lineIndex } = useCurrentLyricWithContext(lrcContent);
 *
 * return (
 *   <div className="lyrics-container">
 *     {surroundingLines.map(({ line, index, isCurrent }) => (
 *       <div key={index} className={isCurrent ? 'active' : 'dimmed'}>
 *         {line.text}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useCurrentLyricWithContext(
  lrcContent: string | null,
  before: number = 2,
  after: number = 2,
  offset: number = DEFAULT_LYRICS_OFFSET
): CurrentLyricState & {
  parsed: ParsedLrc | null;
  surroundingLines: Array<{ line: LrcLine; index: number; isCurrent: boolean }>;
  totalLines: number;
  hasLyrics: boolean;
} {
  const baseState = useCurrentLyric(lrcContent, offset);

  // Get surrounding lines for display
  const surroundingLines = useMemo(() => {
    if (!baseState.parsed || baseState.lineIndex === -1) {
      return [];
    }
    return getSurroundingLines(
      baseState.parsed.lines,
      baseState.lineIndex,
      before,
      after
    );
  }, [baseState.parsed, baseState.lineIndex, before, after]);

  return {
    ...baseState,
    surroundingLines,
  };
}

/**
 * Hook for word-by-word highlighting within the current line.
 * Returns an array of words with their highlight state.
 *
 * @param lrcContent - Raw LRC string content
 * @param offset - Timing offset in milliseconds
 * @returns Words array with highlight states
 *
 * @example
 * ```tsx
 * const { words, currentWordIndex } = useWordHighlighting(lrcContent);
 *
 * return (
 *   <div className="lyric-line">
 *     {words.map((word, i) => (
 *       <span key={i} className={i <= currentWordIndex ? 'highlighted' : ''}>
 *         {word.text}
 *       </span>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useWordHighlighting(
  lrcContent: string | null,
  offset: number = DEFAULT_LYRICS_OFFSET
): {
  words: Array<{ text: string; isActive: boolean; isCompleted: boolean }>;
  currentWordIndex: number | null;
  hasWordTiming: boolean;
} {
  const { line, wordIndex } = useCurrentLyric(lrcContent, offset);

  const words = useMemo(() => {
    if (!line?.words) return [];

    return line.words.map((word, index) => ({
      text: word.text,
      isActive: index === wordIndex,
      isCompleted: wordIndex !== null && index < wordIndex,
    }));
  }, [line, wordIndex]);

  return {
    words,
    currentWordIndex: wordIndex,
    hasWordTiming: line?.words !== undefined && line.words.length > 0,
  };
}

/**
 * Simple hook that just returns the current line text.
 * Useful for minimal UI like the footer line display.
 */
export function useCurrentLineText(
  lrcContent: string | null,
  offset: number = DEFAULT_LYRICS_OFFSET
): {
  text: string | null;
  nextText: string | null;
  lineIndex: number;
  hasLyrics: boolean;
} {
  const { parsed, lineIndex, hasLyrics } = useCurrentLyric(lrcContent, offset);

  const text = useMemo(() => {
    if (!parsed || lineIndex === -1) return null;
    return parsed.lines[lineIndex]?.text ?? null;
  }, [parsed, lineIndex]);

  const nextText = useMemo(() => {
    if (!parsed || lineIndex === -1) return null;
    return parsed.lines[lineIndex + 1]?.text ?? null;
  }, [parsed, lineIndex]);

  return {
    text,
    nextText,
    lineIndex,
    hasLyrics,
  };
}
