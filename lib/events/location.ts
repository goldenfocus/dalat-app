/** Public location fields shared by events, recurring series and venues. */
export interface EventLocation {
  location_name?: string | null;
  address?: string | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_online?: boolean;
  has_private_details?: boolean;
}

export interface LocationVenue {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const LOCATION_VENUE_FIELDS = "id, slug, name, address, google_maps_url, latitude, longitude";

export function hasCoordinates(location: EventLocation): boolean {
  return typeof location.latitude === "number" && Number.isFinite(location.latitude)
    && Math.abs(location.latitude) <= 90
    && typeof location.longitude === "number" && Number.isFinite(location.longitude)
    && Math.abs(location.longitude) <= 180;
}

/** Coordinates take precedence over address searches, matching the venue map. */
export function getLocationMapLinks(location: EventLocation) {
  if (location.is_online || (location.has_private_details && !location.address && !location.google_maps_url)) {
    return { map: null, directions: null };
  }
  const coordinates = hasCoordinates(location)
    ? `${location.latitude},${location.longitude}` : null;
  const query = [location.location_name, location.address].filter(Boolean).join(", ");
  return {
    map: coordinates
      ? `https://www.google.com/maps/search/?api=1&query=${coordinates}`
      : location.google_maps_url || (query
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null),
    directions: coordinates
      ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates}` : null,
  };
}

/**
 * Resolve at read time: changing a venue fixes existing and future occurrences.
 * Never mix a venue's address with stale event coordinates (or expose a private
 * event's venue). An explicit occurrence venue wins over its series' venue.
 */
export function resolveEventLocation<T extends EventLocation>(
  event: T,
  venue: LocationVenue | null | undefined,
): T {
  if (!venue || event.has_private_details || event.is_online) return event;
  const location = {
    ...event,
    location_name: venue.name,
    address: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    google_maps_url: venue.google_maps_url,
  };
  return { ...location, google_maps_url: getLocationMapLinks(location).map };
}
