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
