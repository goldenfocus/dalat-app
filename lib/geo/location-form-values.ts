import { formatCoordinates, isGoogleMapsUrl, parseGoogleMapsUrl, parseCoordinates, generateGoogleMapsUrl } from "./parse-location";

/**
 * Values for the hidden location inputs submitted by LocationPicker.
 *
 * When nothing was selected from the dropdown but the user typed text,
 * the text is kept as a free-form address instead of being discarded —
 * private homes and places Google doesn't know stay valid locations.
 */
export interface LocationFieldValues {
  location_name: string;
  address: string;
  google_maps_url: string;
  latitude: string;
  longitude: string;
}

interface SelectedLocationFields {
  name: string;
  address: string;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
}

export function googleMapsSearchUrl(text: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/**
 * Single eligibility rule for treating typed text as a free-form address.
 * Both the visible "Use as typed" row and the silent submit fallback use it —
 * Maps links have a separate path that preserves the shared destination.
 */
export function isCustomLocationCandidate(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 3 && !/^https?:\/\//i.test(trimmed);
}

export function makeCustomLocation(text: string): {
  name: string;
  address: string;
  latitude: null;
  longitude: null;
  googleMapsUrl: string;
} {
  const trimmed = text.trim();
  return {
    name: trimmed,
    address: trimmed,
    latitude: null,
    longitude: null,
    googleMapsUrl: googleMapsSearchUrl(trimmed),
  };
}

export function makeMapsLocation(input: string): SelectedLocationFields | null {
  const value = input.trim();
  const isMapsLink = isGoogleMapsUrl(value);
  const coordinates = isMapsLink ? parseGoogleMapsUrl(value) : parseCoordinates(value);
  if (!isMapsLink && !coordinates) return null;

  let label = coordinates ? formatCoordinates(coordinates.latitude, coordinates.longitude) : "Google Maps";
  if (isMapsLink) {
    const url = new URL(value);
    const pathLabel = url.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/)?.[1];
    const textLabel = url.searchParams.get("destination") || url.searchParams.get("query") || url.searchParams.get("q");
    try {
      const namedPlace = textLabel || (pathLabel && decodeURIComponent(pathLabel.replace(/\+/g, " ")));
      if (namedPlace && namedPlace.length >= 3 && namedPlace.length <= 200 && !parseCoordinates(namedPlace) && !namedPlace.startsWith("place_id:")) {
        label = namedPlace;
      }
    } catch {
      // Preserve the map link even when its display text cannot be decoded.
    }
  }
  return {
    name: label,
    address: label.length >= 8 ? label : "Google Maps",
    googleMapsUrl: !isMapsLink && coordinates ? generateGoogleMapsUrl(coordinates.latitude, coordinates.longitude) : value,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

export function buildLocationFieldValues(
  selected: SelectedLocationFields | null,
  query: string
): LocationFieldValues {
  const location = selected ?? makeMapsLocation(query);
  if (location) {
    return {
      location_name: location.name,
      address: location.address,
      google_maps_url: location.googleMapsUrl,
      latitude: location.latitude?.toString() ?? "",
      longitude: location.longitude?.toString() ?? "",
    };
  }

  if (!isCustomLocationCandidate(query)) {
    return {
      location_name: "",
      address: "",
      google_maps_url: "",
      latitude: "",
      longitude: "",
    };
  }

  const custom = makeCustomLocation(query);
  return {
    location_name: custom.name,
    address: custom.address,
    google_maps_url: custom.googleMapsUrl,
    latitude: "",
    longitude: "",
  };
}
