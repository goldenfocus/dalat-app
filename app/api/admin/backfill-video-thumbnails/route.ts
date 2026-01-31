import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVideoThumbnailUrl } from '@/lib/cloudflare-stream';

/**
 * Backfill thumbnail URLs for videos already migrated to Cloudflare Stream.
 *
 * GET: Returns count of videos needing thumbnail backfill
 * POST: Backfills thumbnails for a batch of videos
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service configuration missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

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

  // Count videos that have cf_video_uid but no thumbnail
  const { count: needsBackfill } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null)
    .is('thumbnail_url', null);

  // Count total CF videos
  const { count: totalCfVideos } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null);

  // Count videos with thumbnails
  const { count: hasThumb } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('thumbnail_url', 'is', null);

  return NextResponse.json({
    total_cf_videos: totalCfVideos ?? 0,
    needs_thumbnail_backfill: needsBackfill ?? 0,
    already_has_thumbnail: hasThumb ?? 0,
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(body.batchSize ?? 50, 200);

  const supabase = getServiceClient();

  // Get videos that have cf_video_uid but no thumbnail
  const { data: moments, error: fetchError } = await supabase
    .from('moments')
    .select('id, cf_video_uid')
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null)
    .is('thumbnail_url', null)
    .limit(batchSize);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!moments || moments.length === 0) {
    return NextResponse.json({
      message: 'No videos to backfill',
      updated: 0,
    });
  }

  // Batch update all moments with thumbnail URLs
  const updates = moments.map((m) => ({
    id: m.id,
    thumbnail_url: getVideoThumbnailUrl(m.cf_video_uid!, { width: 480 }),
  }));

  let updated = 0;
  const errors: string[] = [];

  // Update in smaller batches to avoid timeout
  for (const update of updates) {
    const { error } = await supabase
      .from('moments')
      .update({ thumbnail_url: update.thumbnail_url })
      .eq('id', update.id);

    if (error) {
      errors.push(`${update.id}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    message: `Backfilled ${updated} thumbnails`,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 10), // Only return first 10 errors
  });
}
