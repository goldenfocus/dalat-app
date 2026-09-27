/**
 * Homepage feeds show one event per venue: the soonest start.
 * Venue pages, the calendar, and other catalogs keep every event.
 *
 * Identity:
 * - venue id when the event has one
 * - otherwise a normalized place name
 * - coordinates disambiguate that name when the same label sits in more than one place
 *
 * Events with neither a venue id nor a place name are not collapsed together.
 */

const COORD_DECIMALS = 3;

export interface VenueDedupeEvent {
  id: string;
  starts_at: string;
  venue_id?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface VenueDedupeResult<T> {
  events: T[];
  /** Other events at the same venue, keyed by the kept event id. */
  moreAtVenueByEventId: Record<string, number>;
}

export function normalizeVenueName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** ~111m buckets, so a venue's GPS jitter stays in one place. */
export function coordinateBucket(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(COORD_DECIMALS)},${longitude.toFixed(COORD_DECIMALS)}`;
}

function venueIdOf(event: VenueDedupeEvent): string | null {
  const id = event.venue_id?.trim();
  return id ? id : null;
}

function groupKey(
  event: VenueDedupeEvent,
  bucketsByName: ReadonlyMap<string, ReadonlySet<string>>,
): string {
  const venueId = venueIdOf(event);
  if (venueId) return `venue:${venueId}`;

  const name = normalizeVenueName(event.location_name);
  if (!name) return `event:${event.id}`;

  const buckets = bucketsByName.get(name);
  const coords = coordinateBucket(event.latitude, event.longitude);
  // One cluster (or none): the name is a single place, including rows that
  // omitted coordinates. Several clusters: keep each place separate.
  if (!buckets || buckets.size <= 1 || !coords) return `place:${name}`;
  return `place:${name}@${coords}`;
}

/**
 * Keep the soonest event for each venue, then apply `limit`.
 * Callers must pass a candidate list larger than `limit` when one venue
 * might otherwise consume the slots.
 */
export function takeSoonestEventPerVenue<T extends VenueDedupeEvent>(
  events: readonly T[],
  limit: number,
): VenueDedupeResult<T> {
  if (limit <= 0 || events.length === 0) {
    return { events: [], moreAtVenueByEventId: {} };
  }

  const sorted = [...events].sort((a, b) => {
    const byStart = a.starts_at.localeCompare(b.starts_at);
    return byStart !== 0 ? byStart : a.id.localeCompare(b.id);
  });

  const bucketsByName = new Map<string, Set<string>>();
  for (const event of sorted) {
    if (venueIdOf(event)) continue;
    const name = normalizeVenueName(event.location_name);
    if (!name) continue;
    const bucket = coordinateBucket(event.latitude, event.longitude);
    if (!bucket) continue;
    const set = bucketsByName.get(name) ?? new Set<string>();
    set.add(bucket);
    bucketsByName.set(name, set);
  }

  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const event of sorted) {
    const key = groupKey(event, bucketsByName);
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
      order.push(key);
    }
  }

  const moreAtVenueByEventId: Record<string, number> = {};
  const kept: T[] = [];
  for (const key of order) {
    if (kept.length >= limit) break;
    const group = groups.get(key)!;
    const representative = group[0];
    kept.push(representative);
    const extra = group.length - 1;
    if (extra > 0 && !key.startsWith("event:")) {
      moreAtVenueByEventId[representative.id] = extra;
    }
  }

  return { events: kept, moreAtVenueByEventId };
}
