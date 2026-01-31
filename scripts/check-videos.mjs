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
    // Remove surrounding quotes if present
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

const { data, count, error } = await supabase
  .from('moments')
  .select('id, media_url, cf_video_uid, video_status, cf_playback_url', { count: 'exact' })
  .eq('content_type', 'video')
  .not('media_url', 'is', null);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

const needsMigration = data.filter(m => !m.cf_video_uid);
const alreadyMigrated = data.filter(m => m.cf_video_uid);

console.log('Video Migration Status');
console.log('======================');
console.log(`Total videos: ${count}`);
console.log(`Needs migration: ${needsMigration.length}`);
console.log(`Already migrated: ${alreadyMigrated.length}`);

// Count by video_status
const statusCounts = {};
data.forEach(m => {
  const status = m.video_status || 'null';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
});

console.log('\nBy video_status:');
Object.entries(statusCounts).forEach(([status, cnt]) => {
  console.log(`  ${status}: ${cnt}`);
});

// Show videos with playback URLs
const withPlayback = data.filter(m => m.cf_playback_url);
console.log(`\nWith cf_playback_url: ${withPlayback.length}`);

if (needsMigration.length > 0) {
  console.log('\nSample URLs to migrate:');
  needsMigration.slice(0, 3).forEach(m => {
    console.log(`  - ${m.id}: ${m.media_url?.substring(0, 80)}...`);
  });
}
