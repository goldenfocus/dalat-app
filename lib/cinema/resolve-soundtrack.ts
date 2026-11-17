/**
 * Cinema mode must never be silent. When an event has no music of its own we
 * fall back to a deterministic "house soundtrack" from the owner's catalogue.
 * Pure and dependency-free so it is trivially testable.
 */

export const HOUSE_MOODS = ["chill", "upbeat", "acoustic", "night", "misty", "celebration"] as const;
export type HouseMood = (typeof HOUSE_MOODS)[number];

/** Tracks queued after the seeded pick so a short track does not end in silence. */
export const HOUSE_QUEUE_LENGTH = 3;

export interface SoundtrackCandidate {
  id: string;
  mood?: string | null;
}

export interface ResolvedSoundtrack<T> {
  tracks: T[];
  isHouse: boolean;
}

const MOOD_KEYWORDS: Array<[HouseMood, readonly string[]]> = [
  ["celebration", ["birthday", "wedding", "anniversary", "celebrat", "party", "new year", "tet"]],
  ["upbeat", ["festival", "dj", "dance", "concert", "live music", "sport", "run", "market", "fair"]],
  ["night", ["night", "bar", "lounge", "jazz", "cocktail", "club"]],
  ["acoustic", ["acoustic", "folk", "guitar", "open mic", "busking", "singer", "poetry"]],
  ["misty", ["hike", "trek", "nature", "sunrise", "camp", "garden", "flower", "forest", "waterfall", "tour"]],
  ["chill", ["coffee", "cafe", "yoga", "wellness", "meditat", "workshop", "book", "art", "class", "brunch"]],
];

/** Maps free-form event hints (ai tags, activity kind...) to mood preferences, best match first. */
export function moodsForHints(hints: ReadonlyArray<string | null | undefined>): HouseMood[] {
  const text = hints
    .filter((hint): hint is string => typeof hint === "string")
    .join(" ")
    .toLowerCase();
  if (!text) return [];
  const scored = MOOD_KEYWORDS.map(([mood, words], order) => ({
    mood,
    order,
    score: words.filter((word) => text.includes(word)).length,
  })).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((entry) => entry.mood);
}

/** FNV-1a 32-bit: stable across runtimes, so an event always maps to the same pick. */
export function seededIndex(seed: string, size: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return size > 0 ? hash % size : 0;
}

export function resolveSoundtrack<T extends SoundtrackCandidate>(input: {
  eventId: string;
  eventTracks: readonly T[];
  houseTracks: readonly T[];
  preferredMoods?: readonly string[];
}): ResolvedSoundtrack<T> {
  const { eventId, eventTracks, houseTracks, preferredMoods = [] } = input;
  if (eventTracks.length > 0) return { tracks: [...eventTracks], isHouse: false };
  if (houseTracks.length === 0) return { tracks: [], isHouse: false };

  // Sort by id so the database's row order can never change the pick.
  const sorted = [...houseTracks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let pool = sorted;
  for (const mood of preferredMoods) {
    const matches = sorted.filter((track) => track.mood === mood);
    if (matches.length > 0) {
      pool = matches;
      break;
    }
  }

  const start = seededIndex(eventId, pool.length);
  const count = Math.min(HOUSE_QUEUE_LENGTH, pool.length);
  const tracks = Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);
  return { tracks, isHouse: true };
}
