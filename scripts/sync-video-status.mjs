/**
 * Sync video status from Cloudflare Stream to database.
 * Use this if webhooks failed or to verify status.
 *
 * Usage: node scripts/sync-video-status.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1].trim()] = value;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const CF_ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = env.CLOUDFLARE_STREAM_API_TOKEN;

function getVODPlaybackUrl(videoUid) {
  return `https://customer-e5d8gaq1w7nvqw0w.cloudflarestream.com/${videoUid}/manifest/video.m3u8`;
}

async function getVideoDetails(videoUid) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${videoUid}`,
    {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get video details: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.result;
}

async function main() {
  console.log('Syncing Video Status from Cloudflare Stream');
  console.log('============================================\n');

  // Get all videos with cf_video_uid that are still processing
  const { data: moments, error } = await supabase
    .from('moments')
    .select('id, cf_video_uid, video_status, cf_playback_url')
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null)
    .neq('video_status', 'ready');

  if (error) {
    console.error('Failed to fetch moments:', error);
    process.exit(1);
  }

  console.log(`Found ${moments.length} videos to sync\n`);

  if (moments.length === 0) {
    console.log('All videos are already synced!');
    return;
  }

  let updated = 0;
  let errors = 0;
  let stillProcessing = 0;

  for (const moment of moments) {
    try {
      const details = await getVideoDetails(moment.cf_video_uid);
      const state = details.status?.state;

      console.log(`${moment.id}: CF status = ${state}`);

      if (state === 'ready') {
        const playbackUrl = getVODPlaybackUrl(moment.cf_video_uid);
        const duration = details.duration ?? null;

        const { error: updateError } = await supabase
          .from('moments')
          .update({
            video_status: 'ready',
            cf_playback_url: playbackUrl,
            video_duration_seconds: duration,
          })
          .eq('id', moment.id);

        if (updateError) {
          throw new Error(`DB update failed: ${updateError.message}`);
        }

        console.log(`  → Updated to ready (duration: ${duration}s)`);
        updated++;
      } else if (state === 'error') {
        const { error: updateError } = await supabase
          .from('moments')
          .update({ video_status: 'error' })
          .eq('id', moment.id);

        if (updateError) {
          throw new Error(`DB update failed: ${updateError.message}`);
        }

        console.log(`  → Updated to error`);
        errors++;
      } else {
        console.log(`  → Still ${state}, skipping`);
        stillProcessing++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`  → Error: ${err.message}`);
      errors++;
    }
  }

  console.log('\n============================================');
  console.log('Sync Complete');
  console.log(`  Updated to ready: ${updated}`);
  console.log(`  Still processing: ${stillProcessing}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
