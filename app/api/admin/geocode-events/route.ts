import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

// Dalat neighborhoods/areas for realistic distribution
const DALAT_AREAS = {
  center: { lat: 11.9404, lng: 108.4583, radius: 0.008 }, // City center, Hồ Xuân Hương
  market: { lat: 11.9428, lng: 108.4381, radius: 0.005 }, // Night market area
  square: { lat: 11.9365, lng: 108.4428, radius: 0.004 }, // Lâm Viên Square
  university: { lat: 11.9550, lng: 108.4420, radius: 0.006 }, // University area
  trainStation: { lat: 11.9340, lng: 108.4550, radius: 0.004 }, // Train station
  hoabinh: { lat: 11.9380, lng: 108.4320, radius: 0.005 }, // Hòa Bình area
  xuanhuong: { lat: 11.9420, lng: 108.4480, radius: 0.006 }, // Around Xuân Hương lake
  camly: { lat: 11.9280, lng: 108.4380, radius: 0.005 }, // Cam Ly waterfall area
  tuyen_lam: { lat: 11.8950, lng: 108.4350, radius: 0.015 }, // Tuyền Lâm lake (larger area)
  langbiang: { lat: 12.0450, lng: 108.4380, radius: 0.020 }, // Lang Biang mountain area
};

type DalatArea = keyof typeof DALAT_AREAS;

interface LocationEstimate {
  lat: number;
  lng: number;
  confidence: "high" | "medium" | "low";
  area: string;
}

/**
 * Use AI to estimate location based on venue name and context
 */
async function estimateLocationWithAI(
  locationName: string,
  eventTitle: string,
  address?: string | null
): Promise<LocationEstimate | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("No Anthropic API key, falling back to random distribution");
    return null;
  }

  const client = new Anthropic({ apiKey });

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

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());

    const areaKey = parsed.area as DalatArea;
    const area = DALAT_AREAS[areaKey] || DALAT_AREAS.center;
    const confidence = parsed.confidence as "high" | "medium" | "low";

    // Add randomness based on confidence
    const randomFactor = confidence === "high" ? 0.3 : confidence === "medium" ? 0.7 : 1.0;
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * area.radius * randomFactor;

    return {
      lat: area.lat + Math.sin(angle) * distance,
      lng: area.lng + Math.cos(angle) * distance,
      confidence,
      area: areaKey,
    };
  } catch (error) {
    console.error("AI location estimation error:", error);
    return null;
  }
}

/**
 * Try Google Geocoding first, fall back to AI estimation
 */
async function getLocationForEvent(
  locationName: string,
  eventTitle: string,
  address?: string | null
): Promise<LocationEstimate | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Try Google Geocoding first
  if (apiKey) {
    const query = `${locationName}${address ? ", " + address : ""}, Đà Lạt, Vietnam`;
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("region", "vn");

    try {
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === "OK" && data.results.length > 0) {
        const result = data.results[0];
        const location = result.geometry.location;

        // Check if it's a specific place (not just "Đà Lạt")
        const isSpecific = result.geometry.location_type !== "APPROXIMATE" ||
          result.types.some((t: string) => ["establishment", "point_of_interest", "premise"].includes(t));

        // Check if within Dalat bounds
        const inBounds = location.lat > 11.85 && location.lat < 12.1 &&
          location.lng > 108.35 && location.lng < 108.6;

        if (inBounds && isSpecific) {
          return {
            lat: location.lat,
            lng: location.lng,
            confidence: "high",
            area: "geocoded",
          };
        }
      }
    } catch (error) {
      console.error("Google geocoding error:", error);
    }
  }

  // Fall back to AI estimation
  const aiEstimate = await estimateLocationWithAI(locationName, eventTitle, address);
  if (aiEstimate) {
    return aiEstimate;
  }

  // Last resort: random distribution across city center
  const area = DALAT_AREAS.center;
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * 0.02; // ~2km radius

  return {
    lat: area.lat + Math.sin(angle) * distance,
    lng: area.lng + Math.cos(angle) * distance,
    confidence: "low",
    area: "random",
  };
}

/**
 * POST /api/admin/geocode-events
 * Geocode events using Google + AI fallback for realistic distribution.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role ? hasRoleLevel(profile.role as UserRole, "admin") : false;
  if (!isAdmin) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const body = await request.json();
  const { eventId, limit = 10, dryRun = false, reprocess = false } = body;

  // Build query
  let query = supabase
    .from("events")
    .select("id, title, location_name, address");

  if (reprocess) {
    // Reprocess all events with location_name
    query = query.not("location_name", "is", null);
  } else {
    // Only events missing coordinates
    query = query.is("latitude", null).not("location_name", "is", null);
  }

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
      results: [],
    });
  }

  const results: Array<{
    id: string;
    title: string;
    location_name: string;
    status: "success" | "failed";
    coordinates?: { lat: number; lng: number };
    confidence?: string;
    area?: string;
    error?: string;
  }> = [];

  let successCount = 0;

  for (const event of events) {
    const estimate = await getLocationForEvent(
      event.location_name,
      event.title,
      event.address
    );

    if (estimate) {
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("events")
          .update({
            latitude: estimate.lat,
            longitude: estimate.lng,
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
          continue;
        }
      }

      results.push({
        id: event.id,
        title: event.title,
        location_name: event.location_name,
        status: "success",
        coordinates: { lat: estimate.lat, lng: estimate.lng },
        confidence: estimate.confidence,
        area: estimate.area,
      });
      successCount++;
    } else {
      results.push({
        id: event.id,
        title: event.title,
        location_name: event.location_name,
        status: "failed",
        error: "Could not estimate location",
      });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    processed: events.length,
    success: successCount,
    failed: events.length - successCount,
    results,
  });
}

/**
 * GET /api/admin/geocode-events
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { count: needsGeocoding } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .is("latitude", null)
    .not("location_name", "is", null);

  const { count: total } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .not("location_name", "is", null);

  return NextResponse.json({
    needsGeocoding: needsGeocoding || 0,
    totalWithLocation: total || 0,
  });
}
