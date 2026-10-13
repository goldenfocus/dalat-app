import "server-only";
import type { OperatingHours } from "@/lib/types";

/**
 * Google Places API (New), server-side only (GOOGLE_PLACES_API_KEY, an
 * unrestricted-by-referrer key limited to the Places API). Terms: only the
 * place_id is stored indefinitely; the other google_* columns are a cache
 * refreshed by /api/cron/refresh-venue-places and always shown with
 * Google attribution. Photos are streamed through /api/places/photo, never
 * copied into our storage.
 */
const BASE = "https://places.googleapis.com/v1";
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "rating",
  "userRatingCount",
  "editorialSummary",
  "googleMapsUri",
  "primaryType",
  "photos",
  "reviews",
];

export type GooglePlace = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  hours: OperatingHours | null;
  rating: number | null;
  ratingCount: number | null;
  summary: string | null;
  mapsUri: string | null;
  primaryType: string | null;
  photos: { name: string; width?: number; height?: number; attributions: { name: string; uri?: string }[] }[];
  reviews: { author: string; authorUri?: string; rating?: number; text: string; when?: string }[];
};

export function placesKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const hhmm = (h = 0, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

type RawPeriod = { open?: { day: number; hour?: number; minute?: number }; close?: { day: number; hour?: number; minute?: number } };
export function hoursFromPeriods(periods: RawPeriod[] | undefined): OperatingHours | null {
  if (!periods?.length) return null;
  // 24/7 places come back as a single open period with no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close)
    return Object.fromEntries(DAYS.map((d) => [d, { open: "00:00", close: "23:59" }])) as OperatingHours;
  const out: Record<string, { open: string; close: string } | "closed"> = {};
  for (const d of DAYS) out[d] = "closed";
  for (const p of periods) {
    if (!p.open) continue;
    const day = DAYS[p.open.day];
    const open = hhmm(p.open.hour, p.open.minute);
    const close = p.close ? hhmm(p.close.hour, p.close.minute) : "23:59";
    const prev = out[day];
    // Split shifts collapse to first open → last close.
    out[day] = prev && prev !== "closed" ? { open: prev.open, close } : { open, close };
  }
  return out as OperatingHours;
}

export function mapPlace(p: any): GooglePlace {
  return {
    placeId: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || null,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    website: p.websiteUri || null,
    hours: hoursFromPeriods(p.regularOpeningHours?.periods),
    rating: typeof p.rating === "number" ? p.rating : null,
    ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    summary: p.editorialSummary?.text || null,
    mapsUri: p.googleMapsUri || null,
    primaryType: p.primaryType || null,
    photos: (p.photos || []).slice(0, 10).map((ph: any) => ({
      name: ph.name,
      width: ph.widthPx,
      height: ph.heightPx,
      attributions: (ph.authorAttributions || []).map((a: any) => ({ name: a.displayName, uri: a.uri })),
    })),
    reviews: (p.reviews || []).slice(0, 5).map((r: any) => ({
      author: r.authorAttribution?.displayName || "Google user",
      authorUri: r.authorAttribution?.uri,
      rating: r.rating,
      text: (r.originalText?.text || r.text?.text || "").slice(0, 600),
      when: r.relativePublishTimeDescription,
    })).filter((r: { text: string }) => r.text),
  };
}

async function places(path: string, init: RequestInit, fields: string) {
  const key = placesKey();
  if (!key) throw new Error("places_unconfigured");
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fields,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places_${res.status}`);
  return res.json();
}

export async function searchPlace(query: string, near?: { lat: number; lng: number }) {
  const data = await places(
    "places:searchText",
    {
      method: "POST",
      body: JSON.stringify({
        textQuery: query,
        languageCode: "vi",
        regionCode: "VN",
        maxResultCount: 3,
        locationBias: {
          circle: {
            center: near ? { latitude: near.lat, longitude: near.lng } : { latitude: 11.9404, longitude: 108.4583 },
            radius: near ? 500 : 20000,
          },
        },
      }),
    },
    FIELDS.map((f) => `places.${f}`).join(","),
  );
  const first = data.places?.[0];
  return first ? mapPlace(first) : null;
}

export async function placeDetails(placeId: string) {
  const data = await places(`places/${encodeURIComponent(placeId)}`, { method: "GET" }, FIELDS.join(","));
  return mapPlace(data);
}

/** OpenStreetMap fallback when Places is unavailable (usage policy: ≤1 req/s, identifying UA). */
export async function nominatimGeocode(query: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "dalat.app venue geocoder (hello@dalat.app)", "Accept-Language": "vi,en" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; addresstype?: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), streetOnly: hit.addresstype === "road" } : null;
}

export function venueTypeFromGoogle(type: string | null, category?: string, name = "") {
  const t = type || "";
  if (/\bchay\b|vegetarian|vegan|thuần chay/i.test(name)) return /vegan|thuần chay/i.test(name) ? "vegan" : "vegetarian";
  if (/vegan/.test(t)) return "vegan";
  if (/vegetarian/.test(t)) return "vegetarian";
  if (/cafe|coffee|tea|bakery/.test(t)) return "cafe";
  if (/bar|pub|night_club/.test(t)) return "bar";
  if (/restaurant|food|meal/.test(t)) return "restaurant";
  if (/hotel|lodging|motel|resort/.test(t)) return "hotel";
  if (/hostel|guest_house|bed_and_breakfast/.test(t)) return "homestay";
  if (/park|garden/.test(t)) return "park";
  if (/gallery|museum/.test(t)) return "gallery";
  if (category === "food") return "restaurant";
  if (category === "coffee") return "cafe";
  if (category === "stay") return "homestay";
  if (category === "outdoors") return "outdoor";
  return "other";
}

/** Columns written from a Places result. */
export function googleColumns(p: GooglePlace) {
  return {
    google_place_id: p.placeId,
    google_rating: p.rating,
    google_user_rating_count: p.ratingCount,
    google_editorial_summary: p.summary,
    google_primary_type: p.primaryType,
    google_photos: p.photos,
    google_reviews: p.reviews,
    google_synced_at: new Date().toISOString(),
  };
}
