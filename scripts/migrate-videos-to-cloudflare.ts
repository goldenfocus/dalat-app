/**
 * Video Migration Script
 *
 * Run with: npx tsx scripts/migrate-videos-to-cloudflare.ts
 *
 * This script:
 * 1. Fixes playback URLs for videos already on Cloudflare (fetches correct URLs from API)
 * 2. Migrates remaining videos from Supabase Storage to Cloudflare Stream
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

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

interface VideoDetails {
  playback?: { hls: string; dash: string };
  thumbnail?: string;
  duration?: number;
  status?: { state: string };
}

async function getVideoDetails(videoUid: string): Promise<VideoDetails | null> {
  try {
    const response = await fetch(
      `${CLOUDFLARE_API_BASE}/accounts/${cfAccountId}/stream/${videoUid}`,
      {
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const data = await response.json();
    if (!data.success) {
      console.error(`  API error for ${videoUid}:`, data.errors?.[0]?.message);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`  Failed to fetch details for ${videoUid}:`, err);
    return null;
  }
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

async function fixCloudflareUrls() {
  console.log('\n🔧 STEP 1: Fixing Cloudflare playback URLs (fetching correct URLs from API)...\n');

  // Get ALL videos with cf_video_uid
  const { data: moments, error } = await supabase
    .from('moments')
    .select('id, cf_video_uid, cf_playback_url')
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null);

  if (error) {
    console.error('Error fetching moments:', error);
    return;
  }

  if (!moments || moments.length === 0) {
    console.log('✅ No Cloudflare videos found');
    return;
  }

  console.log(`Found ${moments.length} Cloudflare videos to verify/fix`);

  let fixed = 0;
  let alreadyCorrect = 0;
  let failed = 0;

  for (const moment of moments) {
    try {
      // Fetch correct URLs from Cloudflare API
      const details = await getVideoDetails(moment.cf_video_uid!);

      if (!details || !details.playback?.hls) {
        console.log(`  ⚠️  ${moment.id}: Video not found or not ready on Cloudflare`);
        failed++;
        continue;
      }

      const correctPlaybackUrl = details.playback.hls;
      const correctThumbnailUrl = details.thumbnail;

      // Check if already correct
      if (moment.cf_playback_url === correctPlaybackUrl) {
        alreadyCorrect++;
        continue;
      }

      // Update with correct URLs
      const { error: updateError } = await supabase
        .from('moments')
        .update({
          cf_playback_url: correctPlaybackUrl,
          thumbnail_url: correctThumbnailUrl,
          video_duration_seconds: details.duration ?? null,
        })
        .eq('id', moment.id);

      if (updateError) {
        console.error(`  ❌ Failed ${moment.id}:`, updateError.message);
        failed++;
      } else {
        fixed++;
        process.stdout.write(`\r  ✅ Fixed ${fixed} URLs...`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.error(`  ❌ Error for ${moment.id}:`, err);
      failed++;
    }
  }

  console.log(`\n\n✅ Fixed: ${fixed}, Already correct: ${alreadyCorrect}, Failed: ${failed}`);
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
    .limit(100);

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

      // Wait a moment for Cloudflare to process
      await new Promise((r) => setTimeout(r, 2000));

      // Fetch correct URLs from Cloudflare
      const details = await getVideoDetails(videoUid);
      const playbackUrl = details?.playback?.hls;
      const thumbnailUrl = details?.thumbnail;

      // Update moment with CF info
      const { error: updateError } = await supabase
        .from('moments')
        .update({
          cf_video_uid: videoUid,
          cf_playback_url: playbackUrl || null,
          thumbnail_url: thumbnailUrl || null,
          video_status: details?.status?.state === 'ready' ? 'ready' : 'processing',
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

    // Rate limit
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

  const { count: hasPlaybackUrl } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_playback_url', 'is', null);

  const { count: needsMigration } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null);

  console.log(`  Total videos:        ${total ?? 0}`);
  console.log(`  On Cloudflare:       ${onCf ?? 0}`);
  console.log(`  Has playback URL:    ${hasPlaybackUrl ?? 0}`);
  console.log(`  Needs migration:     ${needsMigration ?? 0}`);
}

async function main() {
  console.log('🎬 Video Migration to Cloudflare Stream');
  console.log('========================================');

  await showStats();
  await fixCloudflareUrls();
  await migrateVideos();
  await showStats();

  console.log('\n✨ Done!\n');
}

main().catch(console.error);
