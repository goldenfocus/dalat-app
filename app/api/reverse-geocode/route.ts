import { NextResponse } from "next/server";

/**
 * POST /api/reverse-geocode
 *
 * Takes coordinates and returns the nearest place name using Google Geocoding API.
 * Used to enhance coordinate-only locations with human-readable names.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { latitude, longitude } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        { error: "latitude and longitude are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY not configured");
      return NextResponse.json(
        { error: "Geocoding service not configured" },
        { status: 500 }
      );
    }

    // Call Google Geocoding API
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=vi`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({
        name: null,
        address: null,
        message: "No results found for these coordinates"
      });
    }

    // Find the best result - prefer point_of_interest, establishment, or premise
    const priorityTypes = ["point_of_interest", "establishment", "premise", "natural_feature", "park"];

    let bestResult = data.results[0]; // Default to first result

    for (const result of data.results) {
      const types = result.types || [];
      if (priorityTypes.some(t => types.includes(t))) {
        bestResult = result;
        break;
      }
    }

    // Extract a clean name from the result
    // address_components has structured data, formatted_address is the full string
    const addressComponents = bestResult.address_components || [];

    // Try to get a place name (not just street address)
    let name = null;

    // Look for point_of_interest or establishment name
    const poiComponent = addressComponents.find((c: { types: string[] }) =>
      c.types.includes("point_of_interest") ||
      c.types.includes("establishment") ||
      c.types.includes("premise")
    );

    if (poiComponent) {
      name = poiComponent.long_name;
    } else {
      // Fall back to the first meaningful component (not country/admin area)
      const skipTypes = ["country", "administrative_area_level_1", "administrative_area_level_2", "postal_code"];
      const meaningfulComponent = addressComponents.find((c: { types: string[] }) =>
        !c.types.some((t: string) => skipTypes.includes(t))
      );
      if (meaningfulComponent) {
        name = meaningfulComponent.long_name;
      }
    }

    // Get the formatted address
    const address = bestResult.formatted_address;

    return NextResponse.json({
      name: name || address?.split(",")[0] || null,
      address: address || null,
      placeId: bestResult.place_id || null,
    });

  } catch (error) {
    console.error("Reverse geocode error:", error);
    return NextResponse.json(
      { error: "Failed to reverse geocode" },
      { status: 500 }
    );
  }
}
