import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache/server-cache";
import { experienceAdmin, safeMutation } from "@/lib/experiences/server";
import { createClient } from "@/lib/supabase/server";
import { googleMapsSearchUrl } from "@/lib/geo/location-form-values";
import { slugify } from "@/lib/utils";
import { getVenueSearchDirectory } from "@/lib/venues/directory-search";
import { matchPublicEventPlace, matchVenueAtEventLocation } from "@/lib/venues/public-event-places";

const bodySchema = z.object({ eventId: z.string().uuid() });
const venueColumns = "id,slug,owner_id";
const nearbyVenueColumns = "id,slug,owner_id,name,address,latitude,longitude";

function osmVenueId(osmId: string) {
  const hex = createHash("sha256").update("dalat.app/osm/" + osmId).digest("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), "8" + hex.slice(13, 16),
    "8" + hex.slice(17, 20), hex.slice(20, 32)].join("-");
}

export async function POST(request: Request) {
  if (!safeMutation(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const { data: event } = await db.from("events")
    .select("id,slug,series_id,venue_id,location_name,address,latitude,longitude")
    .eq("id", parsed.data.eventId)
    .eq("created_by", user.id)
    .eq("status", "published")
    .not("is_online", "is", true)
    .not("has_private_details", "is", true)
    .or("tribe_id.is.null,tribe_visibility.eq.public")
    .maybeSingle();
  if (!event) return NextResponse.json({ claimSlug: null });

  const result = (venue: { slug: string; owner_id: string | null } | null) =>
    NextResponse.json({ eventSlug: event.slug, claimSlug: venue && !venue.owner_id ? venue.slug : null });

  if (event.venue_id) {
    const { data: venue } = await db.from("venues").select(venueColumns)
      .eq("id", event.venue_id).maybeSingle();
    return result(venue);
  }

  const { data: quota, error: rateError } = await db.rpc("check_rate_limit", {
    p_action: "event_venue_link",
    p_limit: 20,
    p_window_ms: 3_600_000,
  });
  if (rateError || !quota?.allowed) return result(null);

  const location = {
    name: event.location_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
  };
  const directory = await getVenueSearchDirectory().catch((error) => {
    console.error("Event venue directory error:", error);
    return [];
  });
  const canonical = matchVenueAtEventLocation(directory, location);
  let venue: { id: string; slug: string; owner_id: string | null } | null = null;
  if (canonical) {
    const { data } = await db.from("venues").select(venueColumns).eq("id", canonical.id).maybeSingle();
    venue = data;
    if (!venue) return result(null);
  } else {
    const place = matchPublicEventPlace(location);
    if (!place) return result(null);

    const admin = experienceAdmin();
    const { data: nearby, error: nearbyError } = await admin.from("venues")
      .select(nearbyVenueColumns)
      .gte("latitude", place.latitude - 0.001)
      .lte("latitude", place.latitude + 0.001)
      .gte("longitude", place.longitude - 0.001)
      .lte("longitude", place.longitude + 0.001)
      .limit(75);
    if (nearbyError) return result(null);

    venue = matchVenueAtEventLocation(nearby ?? [], place);
    if (!venue) {
      const id = osmVenueId(place.id);
      const stem = slugify(place.name).slice(0, 56).replace(/-+$/, "") || "venue";
      const slug = stem + "-osm-" + place.id.replace("/", "-");
      const { error: insertError } = await admin.from("venues").upsert({
        id, slug, name: place.name, address: place.address,
        latitude: place.latitude, longitude: place.longitude, venue_type: place.venueType,
        google_maps_url: googleMapsSearchUrl([place.name, place.address, "Đà Lạt"].filter(Boolean).join(", ")),
        geocode_source: "osm_event_venue",
        source_locale: "vi",
      }, { onConflict: "id", ignoreDuplicates: true });
      if (insertError) return result(null);

      const { data: saved } = await admin.from("venues").select(venueColumns).eq("id", id).maybeSingle();
      venue = saved;
    }
  }
  if (!venue) return result(null);

  let target = db.from("events").update({ venue_id: venue.id })
    .eq("id", event.id).eq("created_by", user.id).eq("status", "published")
    .is("venue_id", null)
    .not("is_online", "is", true).not("has_private_details", "is", true)
    .or("tribe_id.is.null,tribe_visibility.eq.public");
  for (const column of ["location_name", "address", "latitude", "longitude"] as const) {
    const value = event[column];
    target = value === null ? target.is(column, null) : target.eq(column, value);
  }
  const { data: linked } = await target.select("id").maybeSingle();
  if (!linked) return result(null);

  if (event.series_id) {
    let template = db.from("event_series").update({ venue_id: venue.id })
      .eq("id", event.series_id).eq("created_by", user.id).is("venue_id", null)
      .not("is_online", "is", true);
    let occurrences = db.from("events").update({ venue_id: venue.id })
      .eq("series_id", event.series_id).eq("created_by", user.id).eq("status", "published")
      .is("venue_id", null).not("is_online", "is", true).not("has_private_details", "is", true)
      .or("tribe_id.is.null,tribe_visibility.eq.public");
    for (const column of ["location_name", "address", "latitude", "longitude"] as const) {
      const value = event[column];
      template = value === null ? template.is(column, null) : template.eq(column, value);
      occurrences = value === null ? occurrences.is(column, null) : occurrences.eq(column, value);
    }
    const { data: linkedSeries } = await template.select("id").maybeSingle();
    if (linkedSeries) await occurrences;
  }

  revalidateTag(CACHE_TAGS.events, "max");
  return result(venue);
}
