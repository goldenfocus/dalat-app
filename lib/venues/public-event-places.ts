import type { VenueType } from "@/lib/types";
import { normalizeVenueSearchText } from "./search";
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

function street(value: string | null) {
  return normalizeVenueSearchText((value ?? "").split(",")[0]).replace(/^(d|duong|street) /, "")
    .replace(/^(\d+[a-z]?) (d|duong|street) /, "$1 ");
}

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
  const address = street(input);
  if (name.length < 5 || /^[0-9 ]+$/.test(name)) return [];
  return places.map((place) => {
    const candidate = normalizeVenueSearchText(place.name);
    const candidateStreet = street(place.address);
    const score = candidate === name ? 3
      : candidateStreet && address === candidateStreet ? 2
      : candidate.startsWith(name) ? 1 : 0;
    return { place, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
    .slice(0, 4).map(({ place }) => place);
}

export function matchPublicEventPlace(location: {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  const name = normalizeVenueSearchText(location.name ?? "");
  const address = street(location.address);
  const named = places.filter((place) =>
    name.length >= 4 &&
    normalizeVenueSearchText(place.name) === name &&
    (near(place, location) || (address && street(place.address) === address)));
  if (named.length === 1) return named[0];
  if (named.length || !/^\d/.test(address) || street(location.name) !== address) return null;

  const hasPin = location.latitude !== null && location.longitude !== null;
  const addressed = places.filter((place) => street(place.address) === address &&
    (!hasPin || near(place, location)));
  return addressed.length === 1 ? addressed[0] : null;
}
