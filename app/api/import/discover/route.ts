import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface DiscoveredVenue {
  name: string;
  address?: string;
  website?: string;
  facebookUrl?: string;
  rating?: number;
}

const RATE_LIMIT = 5; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Discover venues using Apify Google Maps scraper
 * This is more automated than the manual script
 */
export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Database-backed rate limiting
  const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
    p_action: 'import_discover',
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });

  if (rateError) {
    console.error("[import/discover] Rate limit check failed:", rateError);
  } else if (!rateCheck?.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Try again later.",
        remaining: 0,
        reset_at: rateCheck?.reset_at,
      },
      { status: 429 }
    );
  }

  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify not configured" },
        { status: 503 }
      );
    }

    console.log(`Venue Discovery: Searching for "${query}"`);

    // Use Apify's Google Maps scraper
    // Actor: compass/crawler-google-places
    const actorId = "compass/crawler-google-places";

    const response = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [
            `bars ${query}`,
            `cafes ${query}`,
            `music venues ${query}`,
            `event spaces ${query}`,
          ],
          maxCrawledPlacesPerSearch: 15,
          language: "en",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apify discovery error:", errorText);
      return NextResponse.json(
        { error: `Discovery failed (${response.status})` },
        { status: 502 }
      );
    }

    const items = await response.json();

    // Transform and deduplicate results
    const seen = new Set<string>();
    const venues: DiscoveredVenue[] = [];

    for (const item of items) {
      const name = item.title || item.name;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      // Extract Facebook URL from website or social links
      let facebookUrl: string | undefined;
      if (item.website?.includes("facebook.com")) {
        facebookUrl = item.website;
      } else if (item.facebookUrl) {
        facebookUrl = item.facebookUrl;
      }

      venues.push({
        name,
        address: item.address || item.vicinity,
        website: item.website,
        facebookUrl,
        rating: item.totalScore || item.rating,
      });
    }

    console.log(`Venue Discovery: Found ${venues.length} venues`);

    return NextResponse.json({
      venues,
      total: venues.length,
    });
  } catch (error) {
    console.error("Discovery error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
