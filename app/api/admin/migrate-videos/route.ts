import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createDirectUpload } from '@/lib/cloudflare-stream';

/**
 * Admin endpoint to migrate existing videos from Supabase Storage to Cloudflare Stream.
 *
 * GET: Returns count of videos needing migration
 * POST: Migrates a batch of videos (default 5 at a time)
 *
 * Videos are migrated by:
 * 1. Creating a Cloudflare Stream upload URL
 * 2. Fetching video from Supabase Storage
 * 3. Uploading to Cloudflare Stream via fetch upload
 * 4. Updating the moment record with cf_video_uid
 *
 * The webhook will update cf_playback_url when encoding completes.
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service configuration missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Simple admin key check - in production you'd want something more robust
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error('ADMIN_API_KEY not configured');
    return false;
  }

  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Count videos that need migration
  const { data, error } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get total video count
  const { count: totalCount } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('media_url', 'is', null);

  const { count: migratedCount } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null);

  return NextResponse.json({
    total_videos: totalCount ?? 0,
    needs_migration: data ? (totalCount ?? 0) - (migratedCount ?? 0) : 0,
    already_migrated: migratedCount ?? 0,
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(body.batchSize ?? 5, 20); // Max 20 at a time

  const supabase = getServiceClient();

  // Get videos that need migration
  const { data: moments, error: fetchError } = await supabase
    .from('moments')
    .select('id, media_url, user_id, event_id')
    .eq('content_type', 'video')
    .not('media_url', 'is', null)
    .is('cf_video_uid', null)
    .limit(batchSize);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!moments || moments.length === 0) {
    return NextResponse.json({
      message: 'No videos to migrate',
      migrated: 0,
      failed: 0,
    });
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const moment of moments) {
    try {
      // Create direct upload URL from Cloudflare
      const { uid: videoUid, uploadURL } = await createDirectUpload({
        meta: {
          momentId: moment.id,
          userId: moment.user_id,
          eventId: moment.event_id,
          migratedFrom: 'supabase',
        },
      });

      // Fetch video from Supabase Storage
      const videoResponse = await fetch(moment.media_url);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.status}`);
      }

      const videoBlob = await videoResponse.blob();

      // Upload to Cloudflare Stream
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

      // Update moment with cf_video_uid
      // video_status stays as 'processing' until webhook confirms ready
      const { error: updateError } = await supabase
        .from('moments')
        .update({
          cf_video_uid: videoUid,
          video_status: 'processing',
        })
        .eq('id', moment.id);

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      results.push({ id: moment.id, success: true });
      console.log(`Migrated video for moment ${moment.id}, CF UID: ${videoUid}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      results.push({ id: moment.id, success: false, error: errorMessage });
      console.error(`Failed to migrate moment ${moment.id}:`, errorMessage);
    }
  }

  const migrated = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({
    message: `Migrated ${migrated} videos, ${failed} failed`,
    migrated,
    failed,
    results,
  });
}
