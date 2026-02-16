#!/usr/bin/env node
/**
 * Backfill video moment URLs with correct CF Stream customer subdomain.
 *
 * The bug: playback/thumbnail URLs were built with the Cloudflare Account ID
 * instead of the Customer Subdomain, producing valid-looking but broken URLs.
 *
 * Wrong:   customer-00b406a96bebe80b300bbaae0cd7f716.cloudflarestream.com
 * Wrong:   customer-e5d8gaq1w7nvqw0w.cloudflarestream.com
 * Correct: customer-9g4uycudmu3mklbc.cloudflarestream.com
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORRECT_SUBDOMAIN = "9g4uycudmu3mklbc";
const WRONG_SUBDOMAINS = [
  "00b406a96bebe80b300bbaae0cd7f716", // account ID (most common mistake)
  "e5d8gaq1w7nvqw0w",                  // old incorrect subdomain from sync script
];

async function backfill() {
  // 1. Fetch all moments with a cf_video_uid
  const { data: moments, error } = await supabase
    .from("moments")
    .select("id, cf_video_uid, cf_playback_url, thumbnail_url")
    .not("cf_video_uid", "is", null);

  if (error) {
    console.error("Failed to fetch moments:", error);
    process.exit(1);
  }

  console.log(`Found ${moments.length} moments with cf_video_uid`);

  let fixed = 0;
  let alreadyCorrect = 0;
  let noUrl = 0;
  const errors = [];

  for (const m of moments) {
    const uid = m.cf_video_uid;
    const correctPlayback = `https://customer-${CORRECT_SUBDOMAIN}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
    const correctThumbnail = `https://customer-${CORRECT_SUBDOMAIN}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;

    const needsPlaybackFix =
      !m.cf_playback_url ||
      WRONG_SUBDOMAINS.some((ws) => m.cf_playback_url?.includes(ws));
    const needsThumbnailFix =
      !m.thumbnail_url ||
      WRONG_SUBDOMAINS.some((ws) => m.thumbnail_url?.includes(ws));

    if (!needsPlaybackFix && !needsThumbnailFix) {
      alreadyCorrect++;
      continue;
    }

    const updates = {};
    if (needsPlaybackFix) updates.cf_playback_url = correctPlayback;
    if (needsThumbnailFix) updates.thumbnail_url = correctThumbnail;

    const { error: updateError } = await supabase
      .from("moments")
      .update(updates)
      .eq("id", m.id);

    if (updateError) {
      errors.push({ id: m.id, error: updateError.message });
      console.error(`  ✗ ${m.id}: ${updateError.message}`);
    } else {
      fixed++;
      const fields = Object.keys(updates).join(", ");
      console.log(`  ✓ ${m.id}: fixed ${fields}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Total with cf_video_uid: ${moments.length}`);
  console.log(`Fixed:                   ${fixed}`);
  console.log(`Already correct:         ${alreadyCorrect}`);
  console.log(`No URL (set fresh):      ${noUrl}`);
  console.log(`Errors:                  ${errors.length}`);
  if (errors.length > 0) {
    console.log("Error details:", errors);
  }
}

backfill();
