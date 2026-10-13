import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";
import { normalizeVenueSearchText } from "@/lib/venues/search";
import { venueName } from "@/lib/experiences/venue-match";
import {
  googleColumns,
  nominatimGeocode,
  placesKey,
  searchPlace,
  venueTypeFromGoogle,
  type GooglePlace,
} from "./places";

type Row = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
};

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** First "number street" chunk of an address, accent/case-insensitive. */
export function streetKey(address: string | null | undefined) {
  const first = normalizeVenueSearchText((address || "").split(",")[0] || "");
  return /^\d/.test(first) ? first : "";
}

/** Same venue = same normalized name AND (same street address OR within 250 m). */
export function matchVenue<T extends Row>(
  name: string,
  address: string,
  point: { lat: number; lng: number } | null,
  venues: T[],
): T | null {
  const want = venueName(name).replace(/ /g, "");
  if (want.length < 3) return null;
  const street = streetKey(address);
  for (const v of venues) {
    const have = venueName(v.name).replace(/ /g, "");
    const sameName = have === want || (Math.min(have.length, want.length) >= 5 && (have.startsWith(want) || want.startsWith(have)));
    if (!sameName) continue;
    const sameStreet = !!street && streetKey(v.address) === street;
    const near = point && v.latitude != null && v.longitude != null
      ? distanceMeters(point, { lat: v.latitude, lng: v.longitude }) < 250
      : false;
    if (sameStreet || near) return v;
  }
  return null;
}

async function uniqueSlug(db: SupabaseClient, base: string) {
  const root = slugify(base).slice(0, 60).replace(/-+$/, "") || "venue";
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    const [{ data: v }, { data: u }] = await Promise.all([
      db.from("venues").select("id").eq("slug", slug).maybeSingle(),
      db.from("unified_slugs").select("slug").eq("slug", slug).maybeSingle(),
    ]);
    if (!v && !u) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export type ResolveResult =
  | { status: "linked" | "created"; venueId: string; slug: string; source: "google" | "osm" | "match" }
  | { status: "skipped"; reason: string };

/**
 * Link an experience to a canonical venue: reuse an existing one when the
 * name + address/proximity match, otherwise create it from Google Places
 * (or, when Places is unavailable, from the contributor's data plus
 * OpenStreetMap geocoding). Never overwrites owner-edited venue fields.
 */
export async function resolveExperienceVenue(
  db: SupabaseClient,
  experience: { id: string; author_id: string; venue_id: string | null; venue_name: string; venue_address: string; category: string },
): Promise<ResolveResult> {
  if (experience.venue_id) return { status: "skipped", reason: "already_linked" };
  const name = experience.venue_name.trim();
  const address = experience.venue_address.trim();
  if (!name) return { status: "skipped", reason: "no_venue_name" };

  const { data: venues } = await db
    .from("venues")
    .select("id,name,address,latitude,longitude,google_place_id,slug")
    .limit(5000);
  const all = (venues || []) as (Row & { slug: string })[];

  let place: GooglePlace | null = null;
  if (placesKey()) {
    try {
      place = await searchPlace(`${name}, ${address || "Đà Lạt"}`);
    } catch (error) {
      console.warn("[venue-resolve] places lookup failed", String(error).slice(0, 120));
    }
  }

  const link = async (venue: Row & { slug: string }, source: "google" | "match") => {
    if (place && !venue.google_place_id) {
      await db.from("venues").update(googleColumns(place)).eq("id", venue.id).is("google_place_id", null);
    }
    await db.from("experiences").update({ venue_id: venue.id }).eq("id", experience.id).is("venue_id", null);
    await db.from("experience_venue_submissions").update({ status: "resolved" }).eq("experience_id", experience.id);
    return { status: "linked" as const, venueId: venue.id, slug: venue.slug, source };
  };

  if (place) {
    const byPlace = all.find((v) => v.google_place_id === place!.placeId);
    if (byPlace) return link(byPlace, "google");
  }
  const point = place ? { lat: place.lat, lng: place.lng } : null;
  const existing = matchVenue(name, address, point, all) || (place ? matchVenue(place.name, place.address || "", point, all) : null);
  if (existing) return link(existing, "match");

  let lat = place?.lat, lng = place?.lng;
  let geocodeSource: "google" | "osm" = "google";
  if (lat == null || lng == null) {
    geocodeSource = "osm";
    const queries = [address, `${name}, ${address}`, `${name}, Đà Lạt`].filter((q) => q.replace(/[, ]/g, ""));
    for (const q of queries) {
      const hit = await nominatimGeocode(q).catch(() => null);
      // Keep only hits inside greater Đà Lạt.
      if (hit && distanceMeters(hit, { lat: 11.9404, lng: 108.4583 }) < 30000) {
        lat = hit.lat; lng = hit.lng; break;
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  if (lat == null || lng == null) return { status: "skipped", reason: "no_coordinates" };

  const canonicalName = place?.name || name;
  const slug = await uniqueSlug(db, canonicalName);
  const mapsUrl = place?.mapsUri
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${canonicalName} ${address}`)}`;
  const { data: created, error } = await db
    .from("venues")
    .insert({
      slug,
      name: canonicalName,
      address: place?.address || address || null,
      latitude: lat,
      longitude: lng,
      venue_type: venueTypeFromGoogle(place?.primaryType || null, experience.category),
      phone: place?.phone || null,
      website_url: place?.website || null,
      operating_hours: place?.hours || null,
      google_maps_url: mapsUrl,
      created_by: experience.author_id,
      geocode_source: geocodeSource,
      source_locale: "vi",
      ...(place ? googleColumns(place) : {}),
    })
    .select("id,slug")
    .single();
  if (error || !created) {
    console.error("[venue-resolve] insert failed", error?.message);
    return { status: "skipped", reason: "insert_failed" };
  }
  await db.from("experiences").update({ venue_id: created.id }).eq("id", experience.id).is("venue_id", null);
  await db.from("experience_venue_submissions").update({ status: "resolved" }).eq("experience_id", experience.id);
  return { status: "created", venueId: created.id, slug: created.slug, source: geocodeSource };
}
