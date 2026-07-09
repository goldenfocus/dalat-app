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
 * text the UI never offered must never be persisted. URLs are excluded so an
 * unresolved pasted Maps link is dropped rather than saved as a venue name.
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

export function buildLocationFieldValues(
  selected: SelectedLocationFields | null,
  query: string
): LocationFieldValues {
  if (selected) {
    return {
      location_name: selected.name,
      address: selected.address,
      google_maps_url: selected.googleMapsUrl,
      latitude: selected.latitude?.toString() ?? "",
      longitude: selected.longitude?.toString() ?? "",
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
