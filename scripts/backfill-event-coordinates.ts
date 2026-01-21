/**
 * Backfill script to add latitude/longitude coordinates to existing events
 *
 * Uses Google Places API to get coordinates from:
 * 1. place_id extracted from google_maps_url (most accurate)
 * 2. Geocoding from address field (fallback)
 *
 * Run with: npx tsx scripts/backfill-event-coordinates.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Extract place_id from Google Maps URL
function extractPlaceId(url: string | null): string | null {
  if (!url) return null;

  // Format: https://www.google.com/maps/place/?q=place_id:ChIJ...
  const placeIdMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
  if (placeIdMatch) return placeIdMatch[1];

  // Format: /place/.../@lat,lng,zoom/data=...!1s0x...!2s...
  // The place_id is sometimes encoded in the data parameter
  const dataMatch = url.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i);
  if (dataMatch) return dataMatch[1];

  return null;
}

// Get coordinates from place_id using Places API
async function getCoordinatesFromPlaceId(placeId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.result?.geometry?.location) {
      return {
        lat: data.result.geometry.location.lat,
        lng: data.result.geometry.location.lng,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching place details for ${placeId}:`, error);
    return null;
  }
}

// Get coordinates from address using Geocoding API
async function getCoordinatesFromAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Add "Vietnam" to improve accuracy for local addresses
    const searchAddress = address.includes("Vietnam") ? address : `${address}, Vietnam`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
      return {
        lat: data.results[0].geometry.location.lat,
        lng: data.results[0].geometry.location.lng,
      };
    }

    // Debug: show why it failed
    if (data.status !== "OK") {
      console.log(`    API status: ${data.status} - ${data.error_message || "no error message"}`);
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
    .is("latitude", null)
    .not("address", "is", null);

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

  for (const event of events) {
    console.log(`Processing: ${event.title}`);

    let coordinates: { lat: number; lng: number } | null = null;

    // Try place_id first (most accurate)
    const placeId = extractPlaceId(event.google_maps_url);
    if (placeId) {
      console.log(`  - Found place_id: ${placeId}`);
      coordinates = await getCoordinatesFromPlaceId(placeId);
    }

    // Fallback to geocoding from address
    if (!coordinates && event.address) {
      console.log(`  - Geocoding address: ${event.address}`);
      coordinates = await getCoordinatesFromAddress(event.address);
    }

    // Last resort: try location_name
    if (!coordinates && event.location_name) {
      console.log(`  - Geocoding location name: ${event.location_name}`);
      coordinates = await getCoordinatesFromAddress(event.location_name);
    }

    if (coordinates) {
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
        console.log(`  ✓ Updated: (${coordinates.lat}, ${coordinates.lng})`);
        successCount++;
      }
    } else {
      console.log(`  ✗ Could not find coordinates`);
      failCount++;
    }

    // Rate limiting: wait 100ms between API calls
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n--- Summary ---`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${events.length}`);
}

backfillEventCoordinates().catch(console.error);
