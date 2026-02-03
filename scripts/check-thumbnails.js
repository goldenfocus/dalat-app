const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('moments')
    .select('id, thumbnail_url, cf_playback_url, media_url')
    .eq('content_type', 'video')
    .eq('status', 'published');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Find videos with cf_playback_url but no thumbnail_url
  const cfOnly = data.filter(m => !m.thumbnail_url && m.cf_playback_url);
  console.log('Videos with cf_playback_url but no thumbnail_url:', cfOnly.length);

  // Check a few CF Stream thumbnail URLs
  const withCf = data.filter(m => m.cf_playback_url).slice(0, 3);
  console.log('\nChecking CF Stream thumbnail URLs:');

  for (const m of withCf) {
    const thumbUrl = m.cf_playback_url.replace('/manifest/video.m3u8', '/thumbnails/thumbnail.jpg');
    console.log('\n  Video ID:', m.id);
    console.log('  Derived thumbnail URL:', thumbUrl);

    try {
      const response = await fetch(thumbUrl, { method: 'HEAD' });
      console.log('  Status:', response.status, response.statusText);
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }

  // Also show the 2 videos missing both
  const missingBoth = data.filter(m => !m.thumbnail_url && !m.cf_playback_url);
  console.log('\n\nVideos missing both thumbnail sources:', missingBoth.length);
  missingBoth.forEach(m => {
    console.log('  ID:', m.id);
    console.log('  media_url:', m.media_url);
  });
}

main();
