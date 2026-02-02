import { NextResponse } from "next/server";
import { parseGoogleMapsUrl } from "@/lib/geo/parse-location";

/**
 * POST /api/resolve-maps-url
 *
 * Resolves a short Google Maps URL (goo.gl/maps, maps.app.goo.gl)
 * to extract coordinates by following redirects.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate it's a Google Maps short URL
    const lowerUrl = url.toLowerCase();
    const isShortUrl =
      lowerUrl.includes("goo.gl/maps") ||
      lowerUrl.includes("maps.app.goo.gl");

    if (!isShortUrl) {
      return NextResponse.json(
        { error: "Only short Google Maps URLs are supported" },
        { status: 400 }
      );
    }

    // Follow redirects to get the full URL
    // Using HEAD request to avoid downloading the full page
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    });

    const finalUrl = response.url;

    // Extract coordinates from the resolved URL
    const parsed = parseGoogleMapsUrl(finalUrl);

    if (!parsed) {
      // If HEAD didn't give us a URL with coords, try GET
      // Some short URLs need the actual page to extract coords
      const getResponse = await fetch(url, {
        redirect: "follow",
      });
      const getUrl = getResponse.url;
      const parsedFromGet = parseGoogleMapsUrl(getUrl);

      if (parsedFromGet) {
        return NextResponse.json({
          latitude: parsedFromGet.latitude,
          longitude: parsedFromGet.longitude,
          resolvedUrl: getUrl,
        });
      }

      return NextResponse.json(
        {
          error: "Could not extract coordinates from URL",
          resolvedUrl: finalUrl,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      resolvedUrl: finalUrl,
    });
  } catch (error) {
    console.error("Error resolving maps URL:", error);
    return NextResponse.json(
      { error: "Failed to resolve URL" },
      { status: 500 }
    );
  }
}
