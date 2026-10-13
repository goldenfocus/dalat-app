import { NextResponse } from "next/server";
import { experienceAdmin } from "@/lib/experiences/server";
import { resolveExperienceVenue } from "@/lib/venues/resolve-experience-venue";
import { googleColumns, placeDetails, placesKey } from "@/lib/venues/places";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: (1) link published experiences that still have no venue (backfill +
 * retry), (2) refresh the Google Places cache on venues older than 25 days
 * (Google terms allow caching non-place_id content only temporarily).
 * Vercel Cron sends Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = experienceAdmin();
  const linked: unknown[] = [];
  const { data: pending } = await db
    .from("experiences")
    .select("id,author_id,venue_id,venue_name,venue_address,category")
    .eq("status", "published")
    .is("venue_id", null)
    .neq("venue_name", "")
    .limit(10);
  for (const e of pending || []) {
    try {
      linked.push({ id: e.id, ...(await resolveExperienceVenue(db, e)) });
    } catch (error) {
      linked.push({ id: e.id, status: "error", reason: String(error).slice(0, 120) });
    }
  }
  const refreshed: string[] = [];
  if (placesKey()) {
    const stale = new Date(Date.now() - 25 * 86400000).toISOString();
    const { data: venues } = await db
      .from("venues")
      .select("id,google_place_id")
      .not("google_place_id", "is", null)
      .or(`google_synced_at.is.null,google_synced_at.lt.${stale}`)
      .limit(40);
    for (const v of venues || []) {
      try {
        const place = await placeDetails(v.google_place_id!);
        await db.from("venues").update(googleColumns(place)).eq("id", v.id);
        refreshed.push(v.id);
      } catch (error) {
        console.warn("[venue-places] refresh failed", v.id, String(error).slice(0, 120));
      }
    }
  }
  return NextResponse.json({ linked, refreshed: refreshed.length, places: !!placesKey() });
}
