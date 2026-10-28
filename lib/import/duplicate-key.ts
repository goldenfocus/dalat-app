/**
 * Duplicate detection for the review gate. Scout can ingest the same show
 * from several ticketing sources (maylangthang.com.vn, nextix.nexpando.vn…)
 * whose titles differ only by a date suffix and whose venue strings differ
 * in detail, so exact title matching misses them.
 */

export type DuplicateCandidate = {
  id: string;
  title: string | null;
  starts_at: string | null;
  venue_id: string | null;
  location_name: string | null;
};

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// "| 13/11/2026", " - 13/11", "(13.11)", "[13-11-26]", "· 13/11", trailing "13/11/2026".
const DATE_SUFFIX =
  /\s*(?:[|\-–—·:,]\s*)?[([]?\s*\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?\s*[)\]]?\s*$/u;

export function normalizeDuplicateTitle(
  title: string | null | undefined,
): string {
  let t = (title ?? "").trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(DATE_SUFFIX, "").trim();
    if (next === t) break;
    t = next;
  }
  return fold(t)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(s.split(" ").filter(Boolean));
}

export function titlesSimilar(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeDuplicateTitle(a);
  const nb = normalizeDuplicateTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = shorter === na ? nb : na;
  if (shorter.length >= 6 && longer.includes(shorter)) return true;
  const ta = tokens(na);
  const tb = tokens(nb);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union > 0 && shared / union >= 0.6;
}

/** Venue name before any " - address" / ", address" detail, folded. */
export function venueKey(location: string | null | undefined): string {
  const head = (location ?? "").split(/\s+[-–—|]\s+|,/u)[0] ?? "";
  return normalizeDuplicateTitle(head);
}

export function sameVenue(
  a: Pick<DuplicateCandidate, "venue_id" | "location_name">,
  b: Pick<DuplicateCandidate, "venue_id" | "location_name">,
): boolean {
  if (a.venue_id && b.venue_id) return a.venue_id === b.venue_id;
  const ka = venueKey(a.location_name);
  const kb = venueKey(b.location_name);
  if (!ka || !kb) return false;
  return ka === kb || ka.startsWith(kb) || kb.startsWith(ka);
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && ta === tb;
}

/**
 * Duplicate when, regardless of source:
 * - same start instant + same venue + similar normalized title, or
 * - same day + identical normalized title (date suffixes stripped).
 * Callers pre-filter candidates to the same day.
 */
export function isDuplicateOf(
  event: DuplicateCandidate,
  other: DuplicateCandidate,
): boolean {
  if (event.id === other.id) return false;
  if (
    sameInstant(event.starts_at, other.starts_at) &&
    sameVenue(event, other) &&
    titlesSimilar(event.title, other.title)
  ) {
    return true;
  }
  const na = normalizeDuplicateTitle(event.title);
  return na.length >= 3 && na === normalizeDuplicateTitle(other.title);
}

export type SeriesInstanceCandidate = DuplicateCandidate & {
  ends_at?: string | null;
  series_id?: string | null;
  venue_name?: string | null;
};

const SERIES_SLOT_TOLERANCE_MS = 60 * 60_000;
const DEFAULT_WINDOW_MS = 2 * 60 * 60_000;
const GENERIC_VENUE_WORDS = new Set([
  "coffee",
  "cafe",
  "caphe",
  "ca",
  "phe",
  "quan",
  "the",
  "dalat",
  "da",
  "lat",
  "bar",
  "restaurant",
  "tea",
  "studio",
  "vietnam",
  "lam",
  "dong",
]);

/** Distinctive venue letters: "Socialhouse Coffee" and "Social House Dalat" -> "socialhouse". */
export function seriesVenueKey(name: string | null | undefined): string {
  return normalizeDuplicateTitle(venueKey(name))
    .split(" ")
    .filter((word) => word && !GENERIC_VENUE_WORDS.has(word))
    .join("");
}

function sameSeriesVenueKey(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.includes(short);
}

function localDay(value: string): string {
  return new Date(Date.parse(value)).toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/**
 * A draft repeats a published recurring-series instance when both fall on
 * the same Đà Lạt date, at the same venue, in the same slot (start within an
 * hour, or overlapping windows). Titles are ignored: chat posts such as
 * "Event at Socialhouse Coffee" rarely repeat the series title.
 */
export function isSeriesInstanceDuplicate(
  event: SeriesInstanceCandidate,
  instance: SeriesInstanceCandidate,
): boolean {
  if (event.id === instance.id || !instance.series_id) return false;
  if (!event.starts_at || !instance.starts_at) return false;
  const start = Date.parse(event.starts_at);
  const otherStart = Date.parse(instance.starts_at);
  if (!Number.isFinite(start) || !Number.isFinite(otherStart)) return false;
  if (localDay(event.starts_at) !== localDay(instance.starts_at)) return false;
  const end = event.ends_at ? Date.parse(event.ends_at) : NaN;
  const otherEnd = instance.ends_at ? Date.parse(instance.ends_at) : NaN;
  const eventEnd =
    Number.isFinite(end) && end > start ? end : start + DEFAULT_WINDOW_MS;
  const instanceEnd =
    Number.isFinite(otherEnd) && otherEnd > otherStart
      ? otherEnd
      : otherStart + DEFAULT_WINDOW_MS;
  const overlap = start < instanceEnd && otherStart < eventEnd;
  if (Math.abs(start - otherStart) > SERIES_SLOT_TOLERANCE_MS && !overlap) {
    return false;
  }
  if (event.venue_id && instance.venue_id) {
    return event.venue_id === instance.venue_id;
  }
  const key = seriesVenueKey(event.location_name);
  if (!key) return false;
  return [instance.location_name, instance.venue_name].some((name) =>
    sameSeriesVenueKey(key, seriesVenueKey(name)),
  );
}
