/**
 * Fix events stuck at Da Lat city center coordinates
 *
 * This script:
 * 1. Finds events at the default city center (11.9404, 108.4583)
 * 2. Resets their coordinates to NULL
 * 3. Re-geocodes them using Google + AI fallback
 *
 * Run with: npx tsx scripts/fix-center-coordinates.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
// Use server key (no HTTP referrer restrictions) for server-side geocoding
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Dalat neighborhoods for AI estimation
const DALAT_AREAS = {
  center: { lat: 11.9404, lng: 108.4583, radius: 0.008 },
  market: { lat: 11.9428, lng: 108.4381, radius: 0.005 },
  square: { lat: 11.9365, lng: 108.4428, radius: 0.004 },
  university: { lat: 11.955, lng: 108.442, radius: 0.006 },
  trainStation: { lat: 11.934, lng: 108.455, radius: 0.004 },
  hoabinh: { lat: 11.938, lng: 108.432, radius: 0.005 },
  xuanhuong: { lat: 11.942, lng: 108.448, radius: 0.006 },
  camly: { lat: 11.928, lng: 108.438, radius: 0.005 },
  tuyen_lam: { lat: 11.895, lng: 108.435, radius: 0.015 },
  langbiang: { lat: 12.045, lng: 108.438, radius: 0.02 },
};

type DalatArea = keyof typeof DALAT_AREAS;

interface LocationEstimate {
  lat: number;
  lng: number;
  confidence: "high" | "medium" | "low";
  source: string;
}

async function tryGooglePlacesSearch(
  locationName: string,
  address?: string | null
): Promise<LocationEstimate | null> {
  if (!GOOGLE_PLACES_KEY) return null;

  // Use Places API Text Search (New) - works with the same key as Places Autocomplete
  const query = `${locationName}${address ? ", " + address : ""}, Đà Lạt, Vietnam`;

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: 11.9404, longitude: 108.4583 },
              radius: 20000.0, // 20km radius around Da Lat
            },
          },
          maxResultCount: 1,
        }),
      }
    );

    const data = await response.json();

    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      const location = place.location;

      if (location?.latitude && location?.longitude) {
        // Verify it's within Da Lat bounds
        const inBounds =
          location.latitude > 11.85 &&
          location.latitude < 12.1 &&
          location.longitude > 108.35 &&
          location.longitude < 108.6;

        if (inBounds) {
          return {
            lat: location.latitude,
            lng: location.longitude,
            confidence: "high",
            source: "google-places",
          };
        }
      }
    }
  } catch (error) {
    console.error("Google Places search error:", error);
  }

  return null;
}

async function tryAIEstimate(
  locationName: string,
  eventTitle: string,
  address?: string | null
): Promise<LocationEstimate | null> {
  if (!ANTHROPIC_KEY) return null;

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const prompt = `You are helping locate venues in Đà Lạt, Vietnam for a map. Given a venue name, estimate which area of Đà Lạt it's likely in.

Known areas in Đà Lạt:
- center: City center around Hồ Xuân Hương lake, main hotels, cafes
- market: Đà Lạt Night Market area, Nguyễn Thị Minh Khai street
- square: Lâm Viên Square (Quảng trường Lâm Viên), flower gardens
- university: Đà Lạt University area, northern part of city
- trainStation: Old Dalat train station (Ga Đà Lạt), Quang Trung street
- hoabinh: Hòa Bình area, western part near cinema
- xuanhuong: Around Xuân Hương lake, cafes and hotels
- camly: Cam Ly waterfall area, southern
- tuyen_lam: Tuyền Lâm lake area, resorts, outside city
- langbiang: Lang Biang mountain, far north, adventure activities

Venue: "${locationName}"
Event: "${eventTitle}"
${address ? `Address hint: "${address}"` : ""}

Respond with ONLY a JSON object (no markdown):
{"area": "areaName", "confidence": "high|medium|low", "reasoning": "brief explanation"}

If you recognize the venue, use "high" confidence. If you can guess from context, use "medium". If completely unknown, use "low".`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());

    const areaKey = parsed.area as DalatArea;
    const area = DALAT_AREAS[areaKey] || DALAT_AREAS.center;
    const confidence = parsed.confidence as "high" | "medium" | "low";

    // Add randomness based on confidence
    const randomFactor =
      confidence === "high" ? 0.3 : confidence === "medium" ? 0.7 : 1.0;
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * area.radius * randomFactor;

    console.log(`    AI: ${parsed.area} (${confidence}) - ${parsed.reasoning}`);

    return {
      lat: area.lat + Math.sin(angle) * distance,
      lng: area.lng + Math.cos(angle) * distance,
      confidence,
      source: `ai:${areaKey}`,
    };
  } catch (error) {
    console.error("AI estimation error:", error);
    return null;
  }
}

async function fixCenterCoordinates() {
  console.log("🔍 Finding events stuck at Da Lat city center...\n");

  // Find events at Da Lat center (with small tolerance)
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, location_name, address")
    .gte("latitude", 11.94)
    .lte("latitude", 11.941)
    .gte("longitude", 108.458)
    .lte("longitude", 108.459);

  if (error) {
    console.error("Error fetching events:", error);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.log("✅ No events stuck at city center!");
    return;
  }

  console.log(`Found ${events.length} events to fix\n`);

  let googleSuccess = 0;
  let aiSuccess = 0;
  let failed = 0;

  for (const event of events) {
    console.log(`\n📍 ${event.title}`);
    console.log(`   Location: ${event.location_name || "none"}`);

    if (!event.location_name) {
      console.log("   ⏭️  Skipping (no location name)");
      failed++;
      continue;
    }

    // Try Google Places API first
    let estimate = await tryGooglePlacesSearch(event.location_name, event.address);

    if (estimate && estimate.source === "google-places") {
      console.log(`   ✅ Google Places: (${estimate.lat.toFixed(5)}, ${estimate.lng.toFixed(5)})`);
      googleSuccess++;
    } else {
      // Fall back to AI
      estimate = await tryAIEstimate(
        event.location_name,
        event.title,
        event.address
      );

      if (estimate) {
        console.log(`   ✅ AI: (${estimate.lat.toFixed(5)}, ${estimate.lng.toFixed(5)})`);
        aiSuccess++;
      }
    }

    if (estimate) {
      const { error: updateError } = await supabase
        .from("events")
        .update({
          latitude: estimate.lat,
          longitude: estimate.lng,
        })
        .eq("id", event.id);

      if (updateError) {
        console.log(`   ❌ Update failed: ${updateError.message}`);
        failed++;
      }
    } else {
      console.log("   ❌ Could not estimate location");
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary");
  console.log("=".repeat(50));
  console.log(`Total processed: ${events.length}`);
  console.log(`Google geocoded: ${googleSuccess}`);
  console.log(`AI estimated:    ${aiSuccess}`);
  console.log(`Failed/skipped:  ${failed}`);
}

fixCenterCoordinates().catch(console.error);
