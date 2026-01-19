#!/usr/bin/env bun
/**
 * Discover Da Lat venues using Google Places API or Apify
 * Extracts venue info and Facebook page URLs for automated event scraping
 *
 * Usage:
 *   bun run scripts/discover-dalat-venues.ts
 *   bun run scripts/discover-dalat-venues.ts --apify  # Use Apify instead of Google
 *
 * Requires: GOOGLE_PLACES_API_KEY in .env.local (or APIFY_API_TOKEN for --apify)
 */

interface Venue {
  name: string;
  placeId: string;
  address: string;
  types: string[];
  rating?: number;
  website?: string;
  facebookUrl?: string;
  phone?: string;
}

const DALAT_CENTER = { lat: 11.9404, lng: 108.4583 };
const SEARCH_RADIUS = 10000; // 10km

// Venue types likely to host events
const VENUE_TYPES = [
  "bar",
  "cafe",
  "night_club",
  "restaurant",
  "art_gallery",
  "museum",
  "tourist_attraction",
];

// Search queries for Apify Google Maps scraper
const APIFY_QUERIES = [
  "bars Da Lat Vietnam",
  "cafes Da Lat Vietnam",
  "night clubs Da Lat Vietnam",
  "event venues Da Lat Vietnam",
  "music venues Da Lat Vietnam",
  "art galleries Da Lat Vietnam",
  "restaurants with live music Da Lat Vietnam",
];

async function discoverVenuesWithGoogle(): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("Missing GOOGLE_PLACES_API_KEY");
    console.log("\nSet it with:");
    console.log("  export GOOGLE_PLACES_API_KEY=your_key_here\n");
    process.exit(1);
  }

  const venues: Venue[] = [];

  for (const type of VENUE_TYPES) {
    console.log(`Searching for ${type}s...`);

    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    );
    url.searchParams.set(
      "location",
      `${DALAT_CENTER.lat},${DALAT_CENTER.lng}`
    );
    url.searchParams.set("radius", String(SEARCH_RADIUS));
    url.searchParams.set("type", type);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (data.results) {
      for (const place of data.results) {
        // Get place details for website/social links
        const details = await getPlaceDetails(apiKey, place.place_id);

        venues.push({
          name: place.name,
          placeId: place.place_id,
          address: place.vicinity,
          types: place.types,
          rating: place.rating,
          website: details?.website,
          facebookUrl: extractFacebookUrl(details?.website, place.name),
          phone: details?.formatted_phone_number,
        });
      }
    }

    // Rate limit (Google allows 1 request per 100ms)
    await new Promise((r) => setTimeout(r, 200));
  }

  return venues;
}

async function getPlaceDetails(apiKey: string, placeId: string) {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,url,formatted_phone_number");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const data = await response.json();
  return data.result;
}

async function discoverVenuesWithApify(): Promise<Venue[]> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error("Missing APIFY_API_TOKEN");
    console.log("\nSet it with:");
    console.log("  export APIFY_API_TOKEN=your_token_here\n");
    process.exit(1);
  }

  console.log("Using Apify Google Maps Scraper...\n");
  console.log("Note: This will cost Apify credits. For free alternative,");
  console.log("manually compile venues from TripAdvisor or Google Maps.\n");

  const venues: Venue[] = [];

  // Using compass/crawler-google-places actor
  const actorId = "compass~crawler-google-places";

  for (const query of APIFY_QUERIES) {
    console.log(`Searching: "${query}"...`);

    const response = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [query],
          maxCrawledPlacesPerSearch: 20,
          language: "en",
        }),
      }
    );

    if (!response.ok) {
      console.warn(`  Failed to search "${query}": ${response.status}`);
      continue;
    }

    const items = await response.json();
    console.log(`  Found ${items.length} places`);

    for (const item of items) {
      venues.push({
        name: item.title || item.name,
        placeId: item.placeId,
        address: item.address || item.vicinity,
        types: item.categories || [],
        rating: item.totalScore || item.rating,
        website: item.website,
        facebookUrl: extractFacebookUrl(item.website, item.title),
        phone: item.phone,
      });
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return venues;
}

function extractFacebookUrl(
  website?: string,
  _name?: string
): string | undefined {
  if (website?.includes("facebook.com")) {
    return website;
  }
  // We could search Facebook for the venue name, but that requires
  // additional API calls. For now, just extract if already a FB URL.
  return undefined;
}

async function main() {
  console.log("======================================================");
  console.log("          Da Lat Venue Discovery Script");
  console.log("======================================================\n");

  const useApify = process.argv.includes("--apify");

  let venues: Venue[];
  if (useApify) {
    venues = await discoverVenuesWithApify();
  } else {
    venues = await discoverVenuesWithGoogle();
  }

  // Deduplicate by placeId or name
  const seen = new Set<string>();
  const unique = venues.filter((v) => {
    const key = v.placeId || v.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nFound ${unique.length} unique venues\n`);

  // Output venues with Facebook URLs
  const withFacebook = unique.filter((v) => v.facebookUrl);
  console.log(`Venues with Facebook pages: ${withFacebook.length}`);

  if (withFacebook.length > 0) {
    console.log("\nFacebook pages found:");
    withFacebook.forEach((v) => {
      console.log(`  - ${v.name}: ${v.facebookUrl}`);
    });
  }

  // Show top-rated venues (likely to host events)
  const topRated = unique
    .filter((v) => v.rating && v.rating >= 4.0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 20);

  console.log(`\nTop rated venues (4.0+): ${topRated.length}`);
  topRated.forEach((v) => {
    console.log(
      `  - ${v.name} (${v.rating}) - ${v.website || "no website"}`
    );
  });

  // Save full results to JSON
  const outputPath = "./data/dalat-venues.json";
  await Bun.write(outputPath, JSON.stringify(unique, null, 2));
  console.log(`\nFull results saved to ${outputPath}`);

  // Create venue URLs file for Apify tasks
  const venueUrls = unique
    .filter((v) => v.facebookUrl || v.website)
    .map((v) => ({
      name: v.name,
      facebookUrl: v.facebookUrl,
      website: v.website,
    }));

  const urlsPath = "./data/dalat-venue-urls.json";
  await Bun.write(urlsPath, JSON.stringify(venueUrls, null, 2));
  console.log(`Venue URLs saved to ${urlsPath}`);

  console.log("\n======================================================");
  console.log("                  Discovery Complete");
  console.log("======================================================\n");
  console.log("Next steps:");
  console.log("  1. Review the venue list and manually add Facebook URLs");
  console.log("  2. Create an Apify saved task with the venue Facebook pages");
  console.log("  3. Configure daily schedule for automated scraping");
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
