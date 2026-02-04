/**
 * Karaoke Components
 *
 * Three-level karaoke display system:
 * - Level 1 (Footer): Single line in mini-player footer
 * - Level 2 (Theater): Bottom sheet (33vh) with surrounding lines
 * - Level 3 (Hero): Full-screen immersive karaoke mode
 *
 * Shareable links:
 * - ?karaoke=theater - Opens Theater mode
 * - ?karaoke=hero - Opens Hero mode
 * - ?track=N - Starts at specific track
 */

export { KaraokeFooterLine, KaraokeToggleButton } from "./KaraokeFooterLine";
export { KaraokeTheater } from "./KaraokeTheater";
export { KaraokeHero } from "./KaraokeHero";
export { KaraokeShareButton } from "./KaraokeShareButton";
