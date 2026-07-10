/**
 * Deterministic designed-cover palette for blog posts without a real cover image.
 *
 * A simple string hash of the seed (usually the post slug) picks one of ten
 * hand-tuned Đà Lạt-flavored gradient pairs, so a given post always renders
 * the same card — in feeds (GeneratedCover) and in og:images — with zero API
 * or network dependency. Colors are dark-elegant so white text reads well on
 * both the light and dark site themes.
 */

export interface CoverPalette {
  /** Gradient start color (top-left) */
  from: string;
  /** Gradient end color (bottom-right) */
  to: string;
  /** Bright tint for chips/details that pops against the gradient */
  accent: string;
  /** Đà Lạt-flavored emoji glyph for the corner mark */
  glyph: string;
}

const PALETTES: CoverPalette[] = [
  // Pine forest
  { from: "hsl(160, 45%, 16%)", to: "hsl(150, 38%, 30%)", accent: "hsl(150, 60%, 72%)", glyph: "🌲" },
  // Misty morning blue
  { from: "hsl(212, 45%, 18%)", to: "hsl(200, 40%, 34%)", accent: "hsl(200, 70%, 76%)", glyph: "🌫️" },
  // Dawn pink over the valley
  { from: "hsl(340, 42%, 22%)", to: "hsl(18, 45%, 36%)", accent: "hsl(350, 80%, 80%)", glyph: "🌸" },
  // Lavender fields
  { from: "hsl(265, 40%, 20%)", to: "hsl(282, 36%, 36%)", accent: "hsl(272, 72%, 80%)", glyph: "🎨" },
  // Coffee amber
  { from: "hsl(28, 48%, 16%)", to: "hsl(40, 50%, 30%)", accent: "hsl(42, 85%, 70%)", glyph: "☕" },
  // Mountain slate
  { from: "hsl(222, 26%, 14%)", to: "hsl(210, 22%, 32%)", accent: "hsl(210, 45%, 78%)", glyph: "🏔️" },
  // Strawberry dusk
  { from: "hsl(350, 46%, 18%)", to: "hsl(330, 42%, 34%)", accent: "hsl(345, 75%, 76%)", glyph: "🍓" },
  // Night sky over Xuân Hương
  { from: "hsl(240, 40%, 13%)", to: "hsl(258, 36%, 28%)", accent: "hsl(250, 62%, 78%)", glyph: "🌙" },
  // Cable-car teal
  { from: "hsl(186, 42%, 16%)", to: "hsl(170, 36%, 30%)", accent: "hsl(175, 65%, 70%)", glyph: "🚡" },
  // Festival plum
  { from: "hsl(300, 36%, 18%)", to: "hsl(322, 40%, 32%)", accent: "hsl(315, 70%, 78%)", glyph: "🎪" },
];

/** djb2-xor string hash — stable, fast, good bucket spread for short slugs. */
function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

export function coverPalette(seed: string): CoverPalette {
  return PALETTES[hashSeed(seed) % PALETTES.length];
}

export function coverGradientCss(seed: string): string {
  const { from, to } = coverPalette(seed);
  return `linear-gradient(135deg, ${from}, ${to})`;
}
