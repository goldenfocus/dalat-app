/**
 * Đà Lạt SEO Keywords
 * Random keywords to sprinkle across music/lyrics pages for local SEO
 */

export const DALAT_KEYWORDS = {
  // Location variations
  locations: [
    "Đà Lạt",
    "Da Lat",
    "Dalat",
    "Lâm Đồng",
    "Lam Dong",
    "Vietnam highlands",
    "Central Highlands Vietnam",
  ],

  // Music/cultural terms
  music: [
    "nhạc Đà Lạt",
    "Dalat music scene",
    "Vietnamese indie",
    "live music Dalat",
    "acoustic Dalat",
    "cafe music Vietnam",
  ],

  // Karaoke specific
  karaoke: [
    "karaoke Đà Lạt",
    "karaoke online Vietnam",
    "hát karaoke",
    "sing along Vietnamese",
    "lyrics with music",
  ],

  // Vibes/atmosphere
  vibes: [
    "foggy city music",
    "mountain town vibes",
    "pine forest sounds",
    "highland melodies",
    "romantic Dalat",
    "chill Vietnam",
  ],
};

/**
 * Get random keywords from a category
 */
export function getRandomKeywords(
  category: keyof typeof DALAT_KEYWORDS,
  count: number = 2
): string[] {
  const keywords = DALAT_KEYWORDS[category];
  const shuffled = [...keywords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get a mix of keywords from all categories
 */
export function getMixedKeywords(count: number = 4): string[] {
  const all = Object.values(DALAT_KEYWORDS).flat();
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate SEO keywords for a music track
 */
export function getTrackSeoKeywords(
  trackTitle: string | null,
  artist: string | null,
  locale: string
): string[] {
  const baseKeywords = [
    trackTitle,
    artist,
    trackTitle && `${trackTitle} lyrics`,
    trackTitle && `${trackTitle} karaoke`,
    artist && `${artist} songs`,
  ].filter(Boolean) as string[];

  // Add locale-specific Dalat keywords
  const dalatKeywords = locale === "vi"
    ? [
        "nhạc Đà Lạt",
        "lời bài hát",
        "karaoke online",
        "hát karaoke Việt Nam",
        ...getRandomKeywords("locations", 1),
      ]
    : [
        "Dalat music",
        "Vietnamese lyrics",
        "karaoke online",
        "Vietnam music scene",
        ...getRandomKeywords("locations", 1),
      ];

  return [...baseKeywords, ...dalatKeywords, ...getRandomKeywords("vibes", 2)];
}
