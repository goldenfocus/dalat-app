import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Escape user input for safe use in PostgREST .or() filters.
 */
function escapePostgrestValue(input: string): string {
  return input
    .replace(/[\x00-\x1f\x7f]/g, "") // Remove control characters
    .replace(/"/g, '""') // Escape double quotes
    .replace(/[%_]/g, "\\$&"); // Escape SQL wildcards
}

/**
 * GET /api/venues/search?q=query - Search venues by name or address
 * GET /api/venues/search?popular=true - Get popular venues for initial display
 * GET /api/venues/search?lat=X&lng=Y&radius=100 - Search venues near coordinates
 *
 * Returns venues with minimal fields needed for the location picker.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase();
  const popular = searchParams.get("popular") === "true";
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = parseInt(searchParams.get("radius") || "150", 10); // meters

  // Base query - select only fields needed for the picker
  let venueQuery = supabase
    .from("venues")
    .select(
      "id, name, venue_type, address, latitude, longitude, google_maps_url, is_verified"
    );

  if (lat && lng) {
    // Nearby search using bounding box
    // ~0.00001 degrees ≈ 1.1 meters at equator, roughly same at Vietnam latitudes
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusDegrees = radius / 111000; // Convert meters to degrees

    venueQuery = venueQuery
      .gte("latitude", latNum - radiusDegrees)
      .lte("latitude", latNum + radiusDegrees)
      .gte("longitude", lngNum - radiusDegrees)
      .lte("longitude", lngNum + radiusDegrees)
      .order("is_verified", { ascending: false })
      .order("priority_score", { ascending: false })
      .limit(3);
  } else if (popular) {
    // Return top venues by priority_score (no search filter)
    venueQuery = venueQuery
      .order("is_verified", { ascending: false })
      .order("priority_score", { ascending: false })
      .limit(5);
  } else if (query && query.length >= 2) {
    // Search by name or address
    const escapedQuery = escapePostgrestValue(query);
    venueQuery = venueQuery
      .or(`name.ilike."%${escapedQuery}%",address.ilike."%${escapedQuery}%"`)
      .order("is_verified", { ascending: false })
      .order("priority_score", { ascending: false })
      .limit(5);
  } else {
    // No query and not popular - return empty
    return NextResponse.json({ venues: [] });
  }

  const { data: venues, error } = await venueQuery;

  if (error) {
    console.error("Venue search error:", error);
    return NextResponse.json({ venues: [] });
  }

  return NextResponse.json({
    venues:
      venues?.map((v) => ({
        id: v.id,
        name: v.name,
        venueType: v.venue_type,
        address: v.address,
        latitude: v.latitude,
        longitude: v.longitude,
        googleMapsUrl: v.google_maps_url,
        isVerified: v.is_verified,
      })) || [],
  });
}
