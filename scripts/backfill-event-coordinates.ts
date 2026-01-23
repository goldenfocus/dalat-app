/**
 * Backfill script to add latitude/longitude coordinates to existing events
 *
 * Strategy (in order):
 * 1. Extract coordinates from google_maps_url (if embedded @lat,lng)
 * 2. Geocode address using OpenStreetMap Nominatim
 * 3. Geocode location_name as fallback
 * 4. Default to Da Lat city center for remaining events
 *
 * Run with: npx tsx scripts/backfill-event-coordinates.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Da Lat city center - fallback for events we can't geocode
const DALAT_CENTER = { lat: 11.9404, lng: 108.4583 };

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Extract coordinates from Google Maps URL (e.g., @11.9404,108.4583,15z)
function extractCoordsFromUrl(url: string | null): { lat: number; lng: number } | null {
  if (!url) return null;

  // Pattern: @lat,lng,zoom or @lat,lng
  const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    // Validate it's a reasonable lat/lng (not zoom level etc)
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

// Get coordinates from address using OpenStreetMap Nominatim (free, no API key)
async function getCoordinatesFromAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Add "Da Lat, Vietnam" to improve accuracy for local addresses
    const searchAddress = address.includes("Vietnam") || address.includes("Việt Nam")
      ? address
      : `${address}, Da Lat, Vietnam`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`;

    const response = await fetch(url, {
      headers: {
        // Nominatim requires a User-Agent header
        "User-Agent": "dalat-app/1.0 (https://dalat.app)",
      },
    });

    const data = await response.json();

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    return null;
  } catch (error) {
    console.error(`Error geocoding address "${address}":`, error);
    return null;
  }
}

async function backfillEventCoordinates() {
  console.log("Starting backfill of event coordinates...\n");

  // Fetch events without coordinates
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, address, location_name, google_maps_url")
    .is("latitude", null);

  if (error) {
    console.error("Error fetching events:", error);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.log("No events to backfill. All events already have coordinates or no address.");
    return;
  }

  console.log(`Found ${events.length} events to process\n`);

  let successCount = 0;
  let failCount = 0;

  let urlExtracted = 0;
  let geocoded = 0;
  let defaulted = 0;

  for (const event of events) {
    console.log(`Processing: ${event.title}`);

    let coordinates: { lat: number; lng: number } | null = null;
    let source = "";

    // 1. Try extracting from Google Maps URL first (instant, no API call)
    coordinates = extractCoordsFromUrl(event.google_maps_url);
    if (coordinates) {
      source = "url";
      urlExtracted++;
      console.log(`  - Extracted from URL: (${coordinates.lat}, ${coordinates.lng})`);
    }

    // 2. Try geocoding from address
    if (!coordinates && event.address) {
      console.log(`  - Geocoding address: ${event.address}`);
      coordinates = await getCoordinatesFromAddress(event.address);
      if (coordinates) {
        source = "geocoded";
        geocoded++;
      }
      // Rate limit only for API calls
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    // 3. Fallback: try location_name
    if (!coordinates && event.location_name) {
      console.log(`  - Geocoding location name: ${event.location_name}`);
      coordinates = await getCoordinatesFromAddress(event.location_name);
      if (coordinates) {
        source = "geocoded";
        geocoded++;
      }
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    // 4. Last resort: default to Da Lat center
    if (!coordinates) {
      coordinates = DALAT_CENTER;
      source = "default";
      defaulted++;
      console.log(`  - Defaulting to Da Lat center`);
    }

    // Update the event
    const { error: updateError } = await supabase
      .from("events")
      .update({
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      })
      .eq("id", event.id);

    if (updateError) {
      console.log(`  ✗ Failed to update: ${updateError.message}`);
      failCount++;
    } else {
      console.log(`  ✓ Updated [${source}]: (${coordinates.lat}, ${coordinates.lng})`);
      successCount++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total: ${events.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`  - From URL: ${urlExtracted}`);
  console.log(`  - Geocoded: ${geocoded}`);
  console.log(`  - Defaulted to Da Lat center: ${defaulted}`);
  console.log(`Failed: ${failCount}`);
}

backfillEventCoordinates().catch(console.error);
