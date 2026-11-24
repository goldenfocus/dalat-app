import type { VenueType } from "@/lib/types";
import { normalizeVenueSearchText, normalizeVenueStreet, rankVenueSearchMatch } from "./search";
import snapshot from "@/public/data/venues/dalat-openstreetmap.json";

type PublicEventPlace = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  venueType: VenueType;
};

const places = snapshot.venues as PublicEventPlace[];

function near(
  place: { latitude: number; longitude: number },
  location: { latitude: number | null; longitude: number | null },
) {
  return location.latitude !== null && location.longitude !== null &&
    Math.hypot((place.latitude - location.latitude) * 111_000,
      (place.longitude - location.longitude) * 109_000) <= 100;
}

export function searchPublicEventPlaces(input: string) {
  const name = normalizeVenueSearchText(input);
  if (name.length < 5 || /^[0-9 ]+$/.test(name)) return [];
  return places.map((place) => ({ place, score: rankVenueSearchMatch(place, input) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
    .slice(0, 4).map(({ place }) => place);
}

export function matchVenueAtEventLocation<Venue extends {
  name: string;
  slug?: string;
  address: string | null;
  latitude: number;
  longitude: number;
}>(candidates: Venue[], location: {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  const name = normalizeVenueSearchText(location.name ?? "");
  const address = normalizeVenueStreet(location.address);
  const hasPin = location.latitude !== null && location.longitude !== null;
  const named = candidates.filter((place) =>
    name.length >= 4 &&
    (normalizeVenueSearchText(place.name) === name || normalizeVenueSearchText(place.slug ?? "") === name) &&
    (!hasPin || near(place, location)) &&
    (/^\d/.test(address) && place.address
      ? normalizeVenueStreet(place.address) === address
      : hasPin));
  if (named.length === 1) return named[0];
  if (named.length || !/^\d/.test(address) || normalizeVenueStreet(location.name) !== address) return null;

  const addressed = candidates.filter((place) => normalizeVenueStreet(place.address) === address &&
    (!hasPin || near(place, location)));
  return addressed.length === 1 ? addressed[0] : null;
}

export function matchPublicEventPlace(location: Parameters<typeof matchVenueAtEventLocation>[1]) {
  return matchVenueAtEventLocation(places, location);
}
