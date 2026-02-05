/**
 * LRC Parser and Timing Utilities
 *
 * Parses LRC format lyrics and provides efficient O(log n) lookup
 * for finding the current line/word during audio playback.
 */

import type {
  LrcLine,
  ParsedLrc,
  TimedSegment,
  WhisperVerboseResponse,
  WhisperSegment,
  CurrentLyricState,
} from '@/lib/types/karaoke';
import { DEFAULT_LYRICS_OFFSET } from '@/lib/types/karaoke';

// ============================================
// LRC Parsing
// ============================================

/**
 * Regex to match LRC timestamp format: [mm:ss.xx] or [mm:ss:xx]
 * Captures minutes, seconds, and centiseconds/milliseconds
 */
const LRC_LINE_REGEX = /^\[(\d{1,2}):(\d{2})[.:](\d{2,3})\](.*)$/;

/**
 * Regex to match LRC metadata tags: [key:value]
 */
const LRC_METADATA_REGEX = /^\[([a-z]+):(.+)\]$/i;

/**
 * Patterns to filter out spam/attribution lines (case-insensitive).
 * These are common in subtitles from various sources.
 */
const SPAM_PATTERNS = [
  /amara\.org/i,
  /subtitles?\s*by/i,
  /transcribed?\s*by/i,
  /captions?\s*by/i,
  /subtitling\s*by/i,
  /www\.\w+\.com/i,
  /www\.\w+\.org/i,
  /^\s*\[.*\]\s*$/,  // Empty bracket lines like "[ ]" or "[music]"
  /^♪+$/,  // Lines that are just music notes
];

/**
 * Check if a text line matches any spam/attribution pattern.
 */
function isSpamLine(text: string): boolean {
  return SPAM_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Parse an LRC format string into a structured document.
 *
 * LRC format example:
 * [ti:Song Title]
 * [ar:Artist Name]
 * [00:00.00]First line
 * [00:05.20]Second line
 */
export function parseLrc(content: string): ParsedLrc {
  const lines: LrcLine[] = [];
  const metadata: ParsedLrc['metadata'] = {};

  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Try to match timestamp line
    const timeMatch = trimmed.match(LRC_LINE_REGEX);
    if (timeMatch) {
      const [, min, sec, ms, text] = timeMatch;
      // Handle both centiseconds (2 digits) and milliseconds (3 digits)
      const msValue = ms.length === 2 ? parseInt(ms) * 10 : parseInt(ms);
      const time =
        parseInt(min) * 60 + parseInt(sec) + msValue / 1000;

      const trimmedText = text.trim();
      // Filter out spam lines (Amara.org credits, etc.)
      if (trimmedText && !isSpamLine(trimmedText)) {
        lines.push({
          time,
          text: trimmedText,
        });
      }
      continue;
    }

    // Try to match metadata line
    const metaMatch = trimmed.match(LRC_METADATA_REGEX);
    if (metaMatch) {
      const [, key, value] = metaMatch;
      switch (key.toLowerCase()) {
        case 'ti':
        case 'title':
          metadata.title = value;
          break;
        case 'ar':
        case 'artist':
          metadata.artist = value;
          break;
        case 'al':
        case 'album':
          metadata.album = value;
          break;
        case 'length':
          // Parse mm:ss or seconds
          if (value.includes(':')) {
            const [m, s] = value.split(':');
            metadata.duration = parseInt(m) * 60 + parseInt(s);
          } else {
            metadata.duration = parseFloat(value);
          }
          break;
        case 'la':
        case 'language':
          metadata.language = value;
          break;
      }
    }
  }

  // Sort lines by time (should already be sorted, but ensure)
  lines.sort((a, b) => a.time - b.time);

  return {
    lines,
    syncLevel: 'line',
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Convert a Whisper verbose_json response to ParsedLrc format.
 * Extracts word-level timing for karaoke highlighting.
 */
export function whisperToLrc(response: WhisperVerboseResponse): ParsedLrc {
  const lines: LrcLine[] = [];

  for (const segment of response.segments) {
    const trimmedText = segment.text.trim();

    // Skip spam/attribution lines
    if (!trimmedText || isSpamLine(trimmedText)) {
      continue;
    }

    const line: LrcLine = {
      time: segment.start,
      text: trimmedText,
    };

    // Add word-level timing if available
    if (segment.words && segment.words.length > 0) {
      line.words = segment.words.map((w) => ({
        text: w.word.trim(),
        startTime: w.start,
        endTime: w.end,
      }));
    }

    lines.push(line);
  }

  return {
    lines,
    syncLevel: response.segments.some((s) => s.words?.length) ? 'word' : 'line',
    metadata: {
      duration: response.duration,
      language: response.language,
    },
  };
}

/**
 * Convert ParsedLrc back to LRC string format.
 * Useful for storing or displaying raw LRC.
 */
export function toLrcString(parsed: ParsedLrc): string {
  const lines: string[] = [];

  // Add metadata
  if (parsed.metadata?.title) {
    lines.push(`[ti:${parsed.metadata.title}]`);
  }
  if (parsed.metadata?.artist) {
    lines.push(`[ar:${parsed.metadata.artist}]`);
  }
  if (parsed.metadata?.album) {
    lines.push(`[al:${parsed.metadata.album}]`);
  }
  if (parsed.metadata?.language) {
    lines.push(`[la:${parsed.metadata.language}]`);
  }

  // Add blank line after metadata
  if (lines.length > 0) {
    lines.push('');
  }

  // Add timed lines
  for (const line of parsed.lines) {
    const timestamp = formatTimestamp(line.time);
    lines.push(`[${timestamp}]${line.text}`);
  }

  return lines.join('\n');
}

/**
 * Format seconds to LRC timestamp format (mm:ss.xx)
 */
export function formatTimestamp(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

// ============================================
// Binary Search for Current Line
// ============================================

/**
 * Find the index of the current line using binary search.
 * Returns the index of the line that should be highlighted at the given time.
 *
 * Time complexity: O(log n)
 *
 * @param lines - Array of LRC lines (must be sorted by time)
 * @param currentTime - Current playback time in seconds
 * @param offset - Timing offset in milliseconds (negative = lyrics appear early)
 * @returns Index of current line, or -1 if before first line
 */
export function findCurrentLineIndex(
  lines: LrcLine[],
  currentTime: number,
  offset: number = DEFAULT_LYRICS_OFFSET
): number {
  if (lines.length === 0) return -1;

  // Apply offset (convert from ms to seconds)
  const adjustedTime = currentTime + offset / 1000;

  // Binary search for the last line that starts before adjustedTime
  let left = 0;
  let right = lines.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (lines[mid].time <= adjustedTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

/**
 * Find the index of the current word within a line.
 * Used for word-by-word highlighting.
 *
 * @param line - The current LRC line with word timing
 * @param currentTime - Current playback time in seconds
 * @param offset - Timing offset in milliseconds
 * @returns Index of current word, or null if line has no word timing
 */
export function findCurrentWordIndex(
  line: LrcLine,
  currentTime: number,
  offset: number = DEFAULT_LYRICS_OFFSET
): number | null {
  if (!line.words || line.words.length === 0) return null;

  const adjustedTime = currentTime + offset / 1000;

  // Find the word that contains the adjusted time
  for (let i = 0; i < line.words.length; i++) {
    const word = line.words[i];
    if (adjustedTime >= word.startTime && adjustedTime < word.endTime) {
      return i;
    }
    // If we're past the end time, this word is completed
    if (adjustedTime >= word.endTime && i === line.words.length - 1) {
      return i; // Last word, keep it highlighted
    }
  }

  // Before first word
  if (adjustedTime < line.words[0].startTime) {
    return null;
  }

  // Find the last word that started
  for (let i = line.words.length - 1; i >= 0; i--) {
    if (adjustedTime >= line.words[i].startTime) {
      return i;
    }
  }

  return null;
}

/**
 * Get the complete current lyric state for the UI.
 * Combines line and word lookup for efficient rendering.
 */
export function getCurrentLyricState(
  parsed: ParsedLrc | null,
  currentTime: number,
  offset: number = DEFAULT_LYRICS_OFFSET
): CurrentLyricState {
  if (!parsed || parsed.lines.length === 0) {
    return {
      lineIndex: -1,
      line: null,
      wordIndex: null,
      progress: 0,
    };
  }

  const lineIndex = findCurrentLineIndex(parsed.lines, currentTime, offset);

  if (lineIndex === -1) {
    return {
      lineIndex: -1,
      line: null,
      wordIndex: null,
      progress: 0,
    };
  }

  const line = parsed.lines[lineIndex];
  const wordIndex = findCurrentWordIndex(line, currentTime, offset);

  // Calculate progress through the current line
  const nextLine = parsed.lines[lineIndex + 1];
  const lineEndTime = nextLine ? nextLine.time : line.time + 10; // Assume 10s if last line
  const lineDuration = lineEndTime - line.time;
  const adjustedTime = currentTime + offset / 1000;
  const progress = Math.min(1, Math.max(0, (adjustedTime - line.time) / lineDuration));

  return {
    lineIndex,
    line,
    wordIndex,
    progress,
  };
}

// ============================================
// Surrounding Lines (for Theater/Hero modes)
// ============================================

/**
 * Get surrounding lines for display in Theater/Hero modes.
 *
 * @param lines - All lyrics lines
 * @param currentIndex - Current line index
 * @param before - Number of lines to show before current
 * @param after - Number of lines to show after current
 * @returns Array of { line, index, isCurrent } objects
 */
export function getSurroundingLines(
  lines: LrcLine[],
  currentIndex: number,
  before: number = 2,
  after: number = 2
): Array<{ line: LrcLine; index: number; isCurrent: boolean }> {
  const result: Array<{ line: LrcLine; index: number; isCurrent: boolean }> = [];

  const startIndex = Math.max(0, currentIndex - before);
  const endIndex = Math.min(lines.length - 1, currentIndex + after);

  for (let i = startIndex; i <= endIndex; i++) {
    result.push({
      line: lines[i],
      index: i,
      isCurrent: i === currentIndex,
    });
  }

  return result;
}
