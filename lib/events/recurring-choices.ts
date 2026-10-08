/**
 * List pages (the Events tab, /events/upcoming) show each recurring show once:
 * its soonest upcoming date, with a "+N more dates" hint. The calendar and
 * venue pages keep every date.
 *
 * Two rows are the same show when they share a series_id, or, for standalone
 * rows (scraped nightly shows are often one row per date), when their titles
 * match once dates and numbering are stripped AND they sit at the same venue
 * (same venue_id or the same normalized place name). Rows with no venue are
 * never grouped by title, so two unrelated "Yoga" listings stay separate.
 */
import { normalizeVenueName } from "./one-per-venue";

export interface RecurringChoiceEvent {
  id: string;
  title: string;
  starts_at: string;
  series_id?: string | null;
  venue_id?: string | null;
  location_name?: string | null;
}

export interface RecurringChoiceGroup<T> {
  /** Soonest upcoming row of the show. */
  event: T;
  /** Every row of the show, soonest first (includes `event`). */
  occurrences: T[];
}

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS =
  "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";

const DATE_PATTERNS: RegExp[] = [
  // 2026-10-11
  /\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/g,
  // 11/10/2026, 11.10.26, 11-10, 11/10
  /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g,
  // Oct 11, Oct 11th 2026, (Sat) Oct 11
  new RegExp(`\\b(?:(?:${WEEKDAYS})\\.?,?\\s+)?(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"),
  // 11 Oct, 11th October 2026
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?:,?\\s+\\d{4})?\\b`, "gi"),
  // Vietnamese: ngày 11 tháng 10 (năm 2026), tháng 10
  /\bngày\s+\d{1,2}(?:\s+tháng\s+\d{1,2})?(?:\s+năm\s+\d{4})?/giu,
  /\btháng\s+\d{1,2}(?:\s+năm\s+\d{4})?/giu,
  // Times: 7:30 PM, 19:30, 19h30, 7pm
  /\b\d{1,2}[:h]\d{2}\s*(?:am|pm)?\b/gi,
  /\b\d{1,2}\s*(?:am|pm)\b/gi,
  // Standalone years
  /\b20\d{2}\b/g,
];

const NUMBERING_PATTERNS: RegExp[] = [
  // #12, No. 3, Vol 2, Ep. 4, Episode 4, Week 3, Session 2, Day 2, Part 1
  /(?:#\s*\d+|\b(?:no|vol|ep|episode|week|session|day|part|chapter|edition|round)\.?\s*\d+)\b/gi,
  // Vietnamese numbering: lần 3, số 5, kỳ 2, buổi 4, đêm 2, tuần 3
  /\b(?:lần|số|kỳ|buổi|đêm|tuần)\s*(?:thứ\s*)?\d+/giu,
  // Ordinals: 3rd edition handled above; bare "(3)" or "[3]"
  /[([]\s*\d+\s*[)\]]/g,
];

/** Title with dates, times, and episode numbering removed, then normalized. */
export function normalizeShowTitle(title: string | null | undefined): string {
  if (!title) return "";
  let value = title;
  for (const pattern of DATE_PATTERNS) value = value.replace(pattern, " ");
  for (const pattern of NUMBERING_PATTERNS) value = value.replace(pattern, " ");
  return normalizeVenueName(value);
}

function venueKeys(event: RecurringChoiceEvent): string[] {
  const keys: string[] = [];
  const venueId = event.venue_id?.trim();
  if (venueId) keys.push(`venue:${venueId}`);
  const place = normalizeVenueName(event.location_name);
  if (place) keys.push(`place:${place}`);
  return keys;
}

function chronological<T extends RecurringChoiceEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const byStart = a.starts_at.localeCompare(b.starts_at);
    return byStart !== 0 ? byStart : a.id.localeCompare(b.id);
  });
}

/**
 * Group rows into shows, soonest show first. Each group's `event` is the
 * soonest row; callers paginate the groups, not the rows.
 */
export function groupRecurringChoices<T extends RecurringChoiceEvent>(
  events: readonly T[],
): RecurringChoiceGroup<T>[] {
  const sorted = chronological(events);

  // Union-find over row indexes. A row joins another when they share a
  // series, or a normalized title plus any venue key (venue id or place name).
  // Matching on either key keeps a show together when only some of its rows
  // were linked to a venue record.
  const parent = sorted.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // Keep the earliest row as the root so iteration order stays chronological.
    if (rootA < rootB) parent[rootB] = rootA;
    else parent[rootA] = rootB;
  };

  const firstByKey = new Map<string, number>();
  const link = (key: string, index: number) => {
    const seen = firstByKey.get(key);
    if (seen === undefined) firstByKey.set(key, index);
    else union(seen, index);
  };

  sorted.forEach((event, index) => {
    const seriesId = event.series_id?.trim();
    if (seriesId) link(`series:${seriesId}`, index);

    const title = normalizeShowTitle(event.title);
    if (!title) return;
    for (const venue of venueKeys(event)) link(`show:${title}|${venue}`, index);
  });

  const groups = new Map<number, T[]>();
  const order: number[] = [];
  sorted.forEach((event, index) => {
    const root = find(index);
    const existing = groups.get(root);
    if (existing) existing.push(event);
    else {
      groups.set(root, [event]);
      order.push(root);
    }
  });

  return order
    .map((root) => groups.get(root)!)
    .map((occurrences) => ({ event: occurrences[0], occurrences }))
    .sort((a, b) => {
      const byStart = a.event.starts_at.localeCompare(b.event.starts_at);
      return byStart !== 0 ? byStart : a.event.id.localeCompare(b.event.id);
    });
}
