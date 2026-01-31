/**
 * Video Migration Script
 *
 * Run with: npx tsx scripts/migrate-videos-to-cloudflare.ts
 *
 * This script:
 * 1. Backfills thumbnail URLs for videos already on Cloudflare Stream
 * 2. Migrates remaining videos from Supabase Storage to Cloudflare Stream
 */

import { createClient } from '@supabase/supabase-js';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

// Load env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
const cfApiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN!;

if (!supabaseUrl || !supabaseKey || !cfAccountId || !cfApiToken) {
  console.error('Missing required environment variables. Run: source .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function getVideoThumbnailUrl(videoUid: string): string {
  return `https://customer-${cfAccountId}.cloudflarestream.com/${videoUid}/thumbnails/thumbnail.jpg?width=480`;
}

function getVODPlaybackUrl(videoUid: string): string {
  return `https://customer-${cfAccountId}.cloudflarestream.com/${videoUid}/manifest/video.m3u8`;
}

async function cloudflareRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${CLOUDFLARE_API_BASE}/accounts/${cfAccountId}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${data.errors?.map((e: { message: string }) => e.message).join(', ')}`);
  }
  return data.result;
}

async function createDirectUpload(): Promise<{ uid: string; uploadURL: string }> {
  return cloudflareRequest('/stream/direct_upload', {
    method: 'POST',
    body: JSON.stringify({
      maxDurationSeconds: 3600,
      requireSignedURLs: false,
    }),
  });
}

async function backfillThumbnails() {
  console.log('\n📸 STEP 1: Backfilling thumbnail URLs for existing CF videos...\n');

  // Get videos with cf_video_uid but no thumbnail
  const { data: moments, error } = await supabase
    .from('moments')
    .select('id, cf_video_uid')
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null)
    .is('thumbnail_url', null);

  if (error) {
    console.error('Error fetching moments:', error);
    return;
  }

  if (!moments || moments.length === 0) {
    console.log('✅ No videos need thumbnail backfill');
    return;
  }

  console.log(`Found ${moments.length} videos needing thumbnail backfill`);

  let updated = 0;
  for (const moment of moments) {
    const thumbnailUrl = getVideoThumbnailUrl(moment.cf_video_uid!);
    const { error: updateError } = await supabase
      .from('moments')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', moment.id);

    if (updateError) {
      console.error(`  ❌ Failed ${moment.id}:`, updateError.message);
    } else {
      updated++;
      process.stdout.write(`\r  ✅ Updated ${updated}/${moments.length}`);
    }
  }
  console.log(`\n✅ Backfilled ${updated} thumbnails`);
}

async function migrateVideos() {
  console.log('\n🚀 STEP 2: Migrating videos to Cloudflare Stream...\n');

  // Get videos that need migration (have media_url but no cf_video_uid)
  const { data: moments, error } = await supabase
    .from('moments')
    .select('id, media_url, user_id, event_id')
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null)
    .limit(100); // Process in batches

  if (error) {
    console.error('Error fetching moments:', error);
    return;
  }

  if (!moments || moments.length === 0) {
    console.log('✅ No videos need migration');
    return;
  }

  console.log(`Found ${moments.length} videos to migrate\n`);

  let migrated = 0;
  let failed = 0;

  for (const moment of moments) {
    try {
      process.stdout.write(`Migrating ${moment.id}... `);

      // Create Cloudflare upload URL
      const { uid: videoUid, uploadURL } = await createDirectUpload();

      // Fetch video from Supabase
      const videoResponse = await fetch(moment.media_url!);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.status}`);
      }

      const videoBlob = await videoResponse.blob();

      // Upload to Cloudflare
      const formData = new FormData();
      formData.append('file', videoBlob, 'video.mp4');

      const uploadResponse = await fetch(uploadURL, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`CF upload failed: ${uploadResponse.status}`);
      }

      // Update moment with CF info (thumbnail will be set by webhook when ready)
      const playbackUrl = getVODPlaybackUrl(videoUid);
      const thumbnailUrl = getVideoThumbnailUrl(videoUid);

      const { error: updateError } = await supabase
        .from('moments')
        .update({
          cf_video_uid: videoUid,
          cf_playback_url: playbackUrl,
          thumbnail_url: thumbnailUrl, // Set immediately - CF generates on first request
          video_status: 'processing',
        })
        .eq('id', moment.id);

      if (updateError) {
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      console.log(`✅ ${videoUid}`);
      migrated++;
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`);
      failed++;
    }

    // Rate limit - don't hammer the APIs
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ Migrated: ${migrated}, Failed: ${failed}`);
}

async function showStats() {
  console.log('\n📊 Current Video Status:\n');

  const { count: total } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video');

  const { count: onCf } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null);

  const { count: hasThumb } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('thumbnail_url', 'is', null);

  const { count: needsMigration } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null);

  console.log(`  Total videos:        ${total ?? 0}`);
  console.log(`  On Cloudflare:       ${onCf ?? 0}`);
  console.log(`  Has thumbnail:       ${hasThumb ?? 0}`);
  console.log(`  Needs migration:     ${needsMigration ?? 0}`);
}

async function main() {
  console.log('🎬 Video Migration to Cloudflare Stream');
  console.log('========================================');

  await showStats();
  await backfillThumbnails();
  await migrateVideos();
  await showStats();

  console.log('\n✨ Done!\n');
}

main().catch(console.error);
