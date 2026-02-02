/**
 * Fix venue storage URLs after R2 migration
 *
 * The original migration script had a typo (cover_image_url instead of cover_photo_url),
 * so venue cover photos and logos weren't updated to R2 URLs.
 *
 * This script fixes that by converting Supabase URLs to R2 URLs.
 *
 * Run with: npx tsx scripts/fix-venue-storage-urls.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key);
}

function convertUrl(supabaseUrl: string): string | null {
  // Extract bucket and path from Supabase URL
  // Format: https://xxx.supabase.co/storage/v1/object/public/{bucket}/{path}
  const match = supabaseUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, bucket, filePath] = match;
  const r2BaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || "https://cdn.dalat.app";
  return `${r2BaseUrl}/${bucket}/${filePath}`;
}

async function fixVenueUrls() {
  console.log("=== Fix Venue Storage URLs ===\n");

  const supabase = getSupabase();
  const r2BaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  if (!r2BaseUrl) {
    console.error("Missing CLOUDFLARE_R2_PUBLIC_URL");
    process.exit(1);
  }

  // Find venues with old Supabase URLs
  const { data: venues, error } = await supabase
    .from("venues")
    .select("id, name, cover_photo_url, logo_url, photos")
    .or("cover_photo_url.ilike.%supabase.co%,logo_url.ilike.%supabase.co%");

  if (error) {
    console.error("Error fetching venues:", error.message);
    process.exit(1);
  }

  console.log(`Found ${venues?.length || 0} venues with Supabase URLs\n`);

  let updated = 0;
  let failed = 0;

  for (const venue of venues || []) {
    console.log(`Processing: ${venue.name}`);

    const updates: Record<string, string | null> = {};

    // Fix cover_photo_url
    if (venue.cover_photo_url?.includes("supabase.co")) {
      const newUrl = convertUrl(venue.cover_photo_url);
      if (newUrl) {
        updates.cover_photo_url = newUrl;
        console.log(`  cover_photo_url: ${venue.cover_photo_url}`);
        console.log(`  → ${newUrl}`);
      }
    }

    // Fix logo_url
    if (venue.logo_url?.includes("supabase.co")) {
      const newUrl = convertUrl(venue.logo_url);
      if (newUrl) {
        updates.logo_url = newUrl;
        console.log(`  logo_url: ${venue.logo_url}`);
        console.log(`  → ${newUrl}`);
      }
    }

    // Fix photos array
    if (Array.isArray(venue.photos)) {
      let photosChanged = false;
      const newPhotos = venue.photos.map((photo: { url: string; caption?: string; sort_order: number }) => {
        if (photo.url?.includes("supabase.co")) {
          const newUrl = convertUrl(photo.url);
          if (newUrl) {
            photosChanged = true;
            console.log(`  photo: ${photo.url}`);
            console.log(`  → ${newUrl}`);
            return { ...photo, url: newUrl };
          }
        }
        return photo;
      });

      if (photosChanged) {
        updates.photos = newPhotos;
      }
    }

    // Update if there are changes
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("venues")
        .update(updates)
        .eq("id", venue.id);

      if (updateError) {
        console.log(`  ✗ Failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Updated`);
        updated++;
      }
    }

    console.log();
  }

  console.log("=== Complete ===");
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
}

fixVenueUrls().catch(console.error);
