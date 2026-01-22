import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

// Dalat center coordinates for biasing geocoding results
const DALAT_CENTER = { lat: 11.9404, lng: 108.4583 };
const DALAT_BOUNDS = {
  south: 11.85,
  west: 108.35,
  north: 12.05,
  east: 108.55,
};

interface GeocodingResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

/**
 * Geocode an address using Google Geocoding API with Dalat bias
 */
async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("Google Maps API key not configured");
    return null;
  }

  // Add "Đà Lạt" to the query if not already present
  const query = address.toLowerCase().includes("đà lạt") || address.toLowerCase().includes("da lat")
    ? address
    : `${address}, Đà Lạt, Vietnam`;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("bounds", `${DALAT_BOUNDS.south},${DALAT_BOUNDS.west}|${DALAT_BOUNDS.north},${DALAT_BOUNDS.east}`);
  url.searchParams.set("region", "vn");

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status === "OK" && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;

      // Check if result is within reasonable distance of Dalat
      const distanceFromDalat = Math.sqrt(
        Math.pow(location.lat - DALAT_CENTER.lat, 2) +
        Math.pow(location.lng - DALAT_CENTER.lng, 2)
      );

      // If too far from Dalat (>0.5 degrees ~55km), reject
      if (distanceFromDalat > 0.5) {
        console.log(`Geocoding result for "${address}" too far from Dalat:`, location);
        return null;
      }

      return {
        lat: location.lat,
        lng: location.lng,
        formatted_address: result.formatted_address,
      };
    }

    console.log(`No geocoding results for "${address}":`, data.status);
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

/**
 * POST /api/admin/geocode-events
 * Geocode events that have location_name but no coordinates.
 * Admin only.
 *
 * Body: { eventId?: string, limit?: number, dryRun?: boolean }
 * - eventId: geocode a single event
 * - limit: max events to geocode (default 10)
 * - dryRun: if true, don't update database
 *
 * Returns: { processed: number, success: number, failed: number, results: [...] }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Check admin authorization
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role ? hasRoleLevel(profile.role as UserRole, "admin") : false;
  if (!isAdmin) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Parse request
  const body = await request.json();
  const { eventId, limit = 10, dryRun = false } = body;

  // Build query for events needing geocoding
  let query = supabase
    .from("events")
    .select("id, title, location_name, address")
    .is("latitude", null)
    .not("location_name", "is", null);

  if (eventId) {
    query = query.eq("id", eventId);
  } else {
    query = query.limit(limit);
  }

  const { data: events, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: "fetch_failed", details: fetchError.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No events need geocoding",
      processed: 0,
      success: 0,
      failed: 0,
      results: [],
    });
  }

  const results: Array<{
    id: string;
    title: string;
    location_name: string;
    status: "success" | "failed" | "skipped";
    coordinates?: { lat: number; lng: number };
    error?: string;
  }> = [];

  let successCount = 0;
  let failedCount = 0;

  for (const event of events) {
    // Combine location_name and address for better geocoding
    const searchAddress = event.address
      ? `${event.location_name}, ${event.address}`
      : event.location_name;

    const geocodeResult = await geocodeAddress(searchAddress);

    if (geocodeResult) {
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("events")
          .update({
            latitude: geocodeResult.lat,
            longitude: geocodeResult.lng,
          })
          .eq("id", event.id);

        if (updateError) {
          results.push({
            id: event.id,
            title: event.title,
            location_name: event.location_name,
            status: "failed",
            error: updateError.message,
          });
          failedCount++;
          continue;
        }
      }

      results.push({
        id: event.id,
        title: event.title,
        location_name: event.location_name,
        status: "success",
        coordinates: { lat: geocodeResult.lat, lng: geocodeResult.lng },
      });
      successCount++;
    } else {
      results.push({
        id: event.id,
        title: event.title,
        location_name: event.location_name,
        status: "failed",
        error: "Could not geocode address",
      });
      failedCount++;
    }

    // Rate limiting: 50ms between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    processed: events.length,
    success: successCount,
    failed: failedCount,
    results,
  });
}

/**
 * GET /api/admin/geocode-events
 * Get count of events needing geocoding.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .is("latitude", null)
    .not("location_name", "is", null);

  if (error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    needsGeocoding: count || 0,
  });
}
