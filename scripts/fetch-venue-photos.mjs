#!/usr/bin/env node
/**
 * Fetches real venue photos from Google Places API and uploads them
 * to Supabase Storage, then updates the venue's cover_photo_url.
 *
 * Usage: node scripts/fetch-venue-photos.mjs
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing required env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Google Places API helpers ---

async function searchPlace(name, lat, lng) {
  // Try with coordinates first (more precise)
  const query = `${name} Da Lat Vietnam`;
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/textsearch/json"
  );
  url.searchParams.set("query", query);
  url.searchParams.set("key", GOOGLE_API_KEY);
  if (lat && lng) {
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", "2000"); // 2km radius
  }

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    return null;
  }

  return data.results[0];
}

async function downloadPhoto(photoReference, maxWidth = 1200) {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/photo"
  );
  url.searchParams.set("maxwidth", String(maxWidth));
  url.searchParams.set("photo_reference", photoReference);
  url.searchParams.set("key", GOOGLE_API_KEY);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Photo download failed: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

// --- Supabase Storage helpers ---

async function uploadToStorage(venueId, buffer, contentType) {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `venues/${venueId}/cover.${ext}`;

  const { data, error } = await supabase.storage
    .from("venue-media")
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("venue-media").getPublicUrl(path);

  return publicUrl;
}

async function updateVenueCoverPhoto(venueId, coverUrl) {
  const { error } = await supabase
    .from("venues")
    .update({ cover_photo_url: coverUrl })
    .eq("id", venueId);

  if (error) {
    throw new Error(`DB update failed: ${error.message}`);
  }
}

// --- Main ---

async function processVenue(venue) {
  const { id, name, latitude, longitude } = venue;

  // 1. Search Google Places
  const place = await searchPlace(name, latitude, longitude);
  if (!place) {
    console.log(`  ⚠ No Google Places result for "${name}"`);
    return { status: "not_found", name };
  }

  // 2. Check for photos
  if (!place.photos?.length) {
    console.log(`  ⚠ No photos available for "${name}" (${place.name})`);
    return { status: "no_photos", name, googleName: place.name };
  }

  // 3. Download the best photo (first one, usually highest quality)
  const photoRef = place.photos[0].photo_reference;
  const { buffer, contentType } = await downloadPhoto(photoRef);
  console.log(
    `  📸 Downloaded ${(buffer.length / 1024).toFixed(0)}KB photo for "${name}"`
  );

  // 4. Upload to Supabase Storage
  const publicUrl = await uploadToStorage(id, buffer, contentType);
  console.log(`  ☁️  Uploaded to storage`);

  // 5. Update venue record
  await updateVenueCoverPhoto(id, publicUrl);
  console.log(`  ✅ Updated cover_photo_url`);

  return { status: "success", name, url: publicUrl };
}

async function main() {
  // Fetch all venues without cover photos
  const { data: venues, error } = await supabase
    .from("venues")
    .select("id, name, slug, venue_type, latitude, longitude, cover_photo_url")
    .or("cover_photo_url.is.null,cover_photo_url.eq.")
    .order("name");

  if (error) {
    console.error("Failed to fetch venues:", error);
    process.exit(1);
  }

  console.log(`\n🏔  Found ${venues.length} venues without cover photos\n`);

  const results = { success: [], not_found: [], no_photos: [], error: [] };

  for (const venue of venues) {
    console.log(`\n[${venue.venue_type}] ${venue.name}`);
    try {
      const result = await processVenue(venue);
      results[result.status].push(result);
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      results.error.push({ name: venue.name, error: err.message });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // Summary
  console.log("\n\n=== SUMMARY ===");
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⚠ Not found on Google: ${results.not_found.length}`);
  console.log(`📷 No photos available: ${results.no_photos.length}`);
  console.log(`❌ Errors: ${results.error.length}`);

  if (results.not_found.length || results.no_photos.length) {
    console.log("\n--- Venues needing manual images ---");
    [...results.not_found, ...results.no_photos].forEach((r) =>
      console.log(`  - ${r.name}`)
    );
  }
  if (results.error.length) {
    console.log("\n--- Errors ---");
    results.error.forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }
}

main().catch(console.error);
