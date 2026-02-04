/**
 * Karaoke/Synced Lyrics Types
 *
 * Supports word-level timing from Whisper API for karaoke-style highlighting.
 * Data structure designed to support syllable-level in the future.
 */

import type { Locale } from './index';

// ============================================
// Core Timing Types
// ============================================

/**
 * A timed segment (word or syllable) with start/end times.
 * Used for word-by-word highlighting during karaoke playback.
 */
export interface TimedSegment {
  text: string;
  startTime: number;  // Seconds from audio start
  endTime: number;    // Seconds from audio start
}

/**
 * A single line of lyrics with optional word-level timing.
 */
export interface LrcLine {
  time: number;           // Line start time (seconds)
  text: string;           // Full line text
  words?: TimedSegment[]; // Word-level timing from Whisper (optional)
  translation?: string;   // Cached translation for current locale
}

/**
 * Parsed LRC document with metadata.
 */
export interface ParsedLrc {
  lines: LrcLine[];
  syncLevel: 'line' | 'word' | 'syllable';
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;     // Total duration in seconds
    language?: string;     // Source language code (e.g., 'vi')
  };
}

// ============================================
// Karaoke Display Levels
// ============================================

/**
 * Karaoke display levels (inspired by ezviet):
 * - 0: Closed - no lyrics visible
 * - 1: Footer - single current line in mini-player (DEFAULT)
 * - 2: Theater - bottom sheet (33vh) with surrounding lines
 * - 3: Hero - full-screen immersive mode
 */
export type KaraokeLevel = 0 | 1 | 2 | 3;

// ============================================
// Current Playback State
// ============================================

/**
 * Information about the currently active lyric segment.
 * Used by the UI to highlight the correct line/word.
 */
export interface CurrentLyricState {
  lineIndex: number;          // Current line index (-1 if none)
  line: LrcLine | null;       // Current line data
  wordIndex: number | null;   // Current word index (if word-level sync)
  progress: number;           // Progress through current line (0-1)
}

// ============================================
// Karaoke Store State (for Zustand)
// ============================================

/**
 * Karaoke-specific state to extend the audio player store.
 */
export interface KaraokeState {
  // Display mode
  karaokeLevel: KaraokeLevel;
  karaokeEnabled: boolean;

  // Timing adjustment
  lyricsOffset: number;       // Milliseconds (negative = lyrics appear early)

  // Translation display
  showTranslation: boolean;
  translationLocale: Locale;

  // Current lyrics data (for active track)
  lyricsData: ParsedLrc | null;
  isLoadingLyrics: boolean;
  lyricsError: string | null;
}

/**
 * Karaoke actions to extend the audio player store.
 */
export interface KaraokeActions {
  setKaraokeLevel: (level: KaraokeLevel) => void;
  toggleKaraoke: () => void;
  setLyricsOffset: (offset: number) => void;
  adjustLyricsOffset: (delta: number) => void;
  toggleTranslation: () => void;
  setTranslationLocale: (locale: Locale) => void;
  setLyricsData: (data: ParsedLrc | null) => void;
  setLyricsLoading: (loading: boolean) => void;
  setLyricsError: (error: string | null) => void;
}

// ============================================
// Whisper API Response Types
// ============================================

/**
 * Whisper word-level timestamp from verbose_json response.
 */
export interface WhisperWord {
  word: string;
  start: number;  // Seconds
  end: number;    // Seconds
}

/**
 * Whisper segment from verbose_json response.
 */
export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
  words?: WhisperWord[];  // Present when timestamp_granularities includes 'word'
}

/**
 * Whisper verbose_json response format.
 */
export interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
  words?: WhisperWord[];  // Top-level words when requested
}

// ============================================
// Constants
// ============================================

/**
 * Default timing offset in milliseconds.
 * Negative value means lyrics appear before the audio (teleprompter effect).
 * 800ms is the sweet spot from ezviet's testing.
 */
export const DEFAULT_LYRICS_OFFSET = -800;

/**
 * Default karaoke level when audio starts playing.
 * Level 1 (Footer) shows current line in mini-player.
 */
export const DEFAULT_KARAOKE_LEVEL: KaraokeLevel = 1;
