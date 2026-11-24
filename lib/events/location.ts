import { generateGoogleMapsUrl, isGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/geo/parse-location";
import { googleMapsSearchUrl } from "@/lib/geo/location-form-values";

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
  geocode_source?: "google" | "osm" | "osm_street" | null;
}

export const LOCATION_VENUE_FIELDS = "id, slug, name, address, google_maps_url, latitude, longitude, geocode_source";

export function hasCoordinates(location: EventLocation): boolean {
  return typeof location.latitude === "number" && Number.isFinite(location.latitude)
    && Math.abs(location.latitude) <= 90
    && typeof location.longitude === "number" && Number.isFinite(location.longitude)
    && Math.abs(location.longitude) <= 180;
}

function getLocationPin(location: EventLocation) {
  if (location.latitude == null || location.longitude == null || !hasCoordinates(location)) return null;
  return (location.google_maps_url && parseGoogleMapsUrl(location.google_maps_url)) || {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

/** Use the saved map for opening a place and its precise pin for directions. */
export function getLocationMapLinks(location: EventLocation) {
  if (location.is_online || (location.has_private_details && !location.address && !location.google_maps_url)) {
    return { map: null, directions: null };
  }
  const rawUrl = location.google_maps_url?.trim();
  const savedMap = rawUrl && isGoogleMapsUrl(rawUrl) ? rawUrl : null;
  const legacyMap = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  const coordinates = getLocationPin(location);
  const query = Array.from(new Set([location.location_name, location.address].filter(Boolean))).join(", ");
  return {
    map: savedMap || (coordinates
      ? generateGoogleMapsUrl(coordinates.latitude, coordinates.longitude)
      : (legacyMap || (query ? googleMapsSearchUrl(query) : null))),
    directions: coordinates
      ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.latitude},${coordinates.longitude}` : null,
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
  const approximate = venue.geocode_source === "osm_street";
  const location = {
    ...event,
    location_name: venue.name,
    address: venue.address,
    latitude: approximate ? null : venue.latitude,
    longitude: approximate ? null : venue.longitude,
    google_maps_url: venue.google_maps_url,
  };
  const venuePin = !approximate && venue.latitude !== null && venue.longitude !== null && hasCoordinates(location)
    ? generateGoogleMapsUrl(venue.latitude, venue.longitude) : null;
  return { ...location, google_maps_url: venuePin || getLocationMapLinks(location).map };
}

/**
 * Single source for calendar exports (Google link, .ics, series .ics).
 * `text` always carries the place name with the address: an address alone
 * makes Google Calendar re-geocode it to the wrong pin. `mapUrl` is the same
 * link the event page uses, so every surface opens the same place.
 */
export function getCalendarLocation(location: EventLocation) {
  const parts = [location.location_name, location.address].filter(
    (part, i, all): part is string => !!part && all.indexOf(part) === i,
  );
  const text = parts.join(", ") || (location.google_maps_url ?? "");
  const pin = getLocationPin(location);
  return {
    text,
    mapUrl: getLocationMapLinks(location).map,
    geo: pin ? `${pin.latitude};${pin.longitude}` : null,
  };
}
