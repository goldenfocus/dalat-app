/**
 * Migrate existing videos from Supabase Storage to Cloudflare Stream.
 *
 * Usage: node scripts/migrate-videos.mjs [--batch-size=5] [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 5;

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

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('Missing Cloudflare credentials in .env.local');
  process.exit(1);
}

/**
 * Create a direct upload URL from Cloudflare Stream
 */
async function createDirectUpload(meta = {}) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 300, // 5 minutes max
        meta,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudflare API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return {
    uid: data.result.uid,
    uploadURL: data.result.uploadURL,
  };
}

/**
 * Migrate a single video
 */
async function migrateVideo(moment) {
  console.log(`  Migrating ${moment.id}...`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would migrate: ${moment.media_url}`);
    return { success: true, dryRun: true };
  }

  try {
    // Create direct upload URL
    const { uid, uploadURL } = await createDirectUpload({
      momentId: moment.id,
      userId: moment.user_id,
      eventId: moment.event_id,
      migratedFrom: 'supabase',
    });
    console.log(`    Created upload URL, CF UID: ${uid}`);

    // Download from Supabase
    console.log(`    Downloading from Supabase...`);
    const videoResponse = await fetch(moment.media_url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download: ${videoResponse.status}`);
    }
    const videoBlob = await videoResponse.blob();
    console.log(`    Downloaded ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // Upload to Cloudflare
    console.log(`    Uploading to Cloudflare Stream...`);
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');

    const uploadResponse = await fetch(uploadURL, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Cloudflare upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    console.log(`    Uploaded to Cloudflare`);

    // Update moment in database
    const { error: updateError } = await supabase
      .from('moments')
      .update({
        cf_video_uid: uid,
        video_status: 'processing',
      })
      .eq('id', moment.id);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }
    console.log(`    Updated moment record`);

    return { success: true, uid };

  } catch (err) {
    console.error(`    ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('Cloudflare Stream Video Migration');
  console.log('==================================');
  console.log(`Batch size: ${batchSize}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  // Get all videos needing migration
  const { data: moments, error } = await supabase
    .from('moments')
    .select('id, media_url, user_id, event_id')
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch moments:', error);
    process.exit(1);
  }

  console.log(`Found ${moments.length} videos to migrate\n`);

  if (moments.length === 0) {
    console.log('Nothing to migrate!');
    return;
  }

  let migrated = 0;
  let failed = 0;
  let batch = 1;

  for (let i = 0; i < moments.length; i += batchSize) {
    const batchMoments = moments.slice(i, i + batchSize);
    console.log(`\nBatch ${batch} (${batchMoments.length} videos)`);
    console.log('-'.repeat(40));

    for (const moment of batchMoments) {
      const result = await migrateVideo(moment);
      if (result.success) {
        migrated++;
      } else {
        failed++;
      }

      // Small delay between videos to avoid rate limiting
      if (!dryRun) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    batch++;

    // Pause between batches
    if (i + batchSize < moments.length && !dryRun) {
      console.log('\nWaiting 5 seconds before next batch...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n==================================');
  console.log('Migration Complete');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${moments.length}`);

  if (!dryRun && migrated > 0) {
    console.log('\nNote: Videos are now processing on Cloudflare Stream.');
    console.log('The webhook will update cf_playback_url when encoding completes.');
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
