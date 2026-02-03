import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVideoThumbnailUrl } from '@/lib/cloudflare-stream';

/**
 * Backfill thumbnail URLs for videos.
 *
 * Handles two types of videos:
 * 1. Cloudflare Stream videos (have cf_video_uid) - thumbnails derived automatically
 * 2. Supabase Storage videos (have media_url only) - requires client-provided thumbnail
 *
 * GET: Returns count of videos needing thumbnail backfill (both types)
 * POST: Backfills thumbnails for CF videos OR saves client-provided thumbnail
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

  // In development, also allow without auth for testing
  if (process.env.NODE_ENV === 'development' && !adminKey) {
    return true;
  }

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

  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId');
  const includeList = url.searchParams.get('list') === 'true';

  const supabase = getServiceClient();

  // Count CF videos needing thumbnails (can be auto-generated)
  let cfQuery = supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('cf_video_uid', 'is', null)
    .is('thumbnail_url', null);
  if (eventId) cfQuery = cfQuery.eq('event_id', eventId);
  const { count: cfNeedsBackfill } = await cfQuery;

  // Count Supabase Storage videos needing thumbnails (require client-provided)
  let storageQuery = supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .is('cf_video_uid', null)
    .is('thumbnail_url', null)
    .not('media_url', 'is', null);
  if (eventId) storageQuery = storageQuery.eq('event_id', eventId);
  const { count: storageNeedsBackfill } = await storageQuery;

  // Count total videos
  let totalQuery = supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video');
  if (eventId) totalQuery = totalQuery.eq('event_id', eventId);
  const { count: totalVideos } = await totalQuery;

  // Count videos with thumbnails
  let thumbQuery = supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'video')
    .not('thumbnail_url', 'is', null);
  if (eventId) thumbQuery = thumbQuery.eq('event_id', eventId);
  const { count: hasThumb } = await thumbQuery;

  const response: Record<string, unknown> = {
    total_videos: totalVideos ?? 0,
    cf_needs_backfill: cfNeedsBackfill ?? 0,
    storage_needs_backfill: storageNeedsBackfill ?? 0,
    already_has_thumbnail: hasThumb ?? 0,
  };

  // Optionally include list of storage videos needing thumbnails
  if (includeList && (storageNeedsBackfill ?? 0) > 0) {
    let listQuery = supabase
      .from('moments')
      .select('id, media_url, event_id, created_at')
      .eq('content_type', 'video')
      .is('cf_video_uid', null)
      .is('thumbnail_url', null)
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (eventId) listQuery = listQuery.eq('event_id', eventId);
    const { data: videos } = await listQuery;
    response.storage_videos = videos || [];
  }

  return NextResponse.json(response);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const supabase = getServiceClient();

  // Mode 1: Client-provided thumbnail for a specific video
  if (body.momentId && body.thumbnailBase64) {
    const { momentId, thumbnailBase64 } = body;

    // Verify moment exists and is a video without thumbnail
    const { data: moment, error: momentError } = await supabase
      .from('moments')
      .select('id, content_type, thumbnail_url, event_id, user_id')
      .eq('id', momentId)
      .single();

    if (momentError || !moment) {
      return NextResponse.json({ error: 'Moment not found' }, { status: 404 });
    }

    if (moment.content_type !== 'video') {
      return NextResponse.json({ error: 'Moment is not a video' }, { status: 400 });
    }

    // Decode base64 thumbnail
    const base64Data = thumbnailBase64.replace(/^data:image\/jpeg;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase storage
    const timestamp = Date.now();
    const thumbnailPath = `${moment.event_id}/${moment.user_id}/${timestamp}_thumb.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('moments')
      .upload(thumbnailPath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[backfill] Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload thumbnail' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('moments').getPublicUrl(thumbnailPath);
    const thumbnailUrl = urlData.publicUrl;

    // Update moment with thumbnail URL
    const { error: updateError } = await supabase
      .from('moments')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', momentId);

    if (updateError) {
      console.error('[backfill] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update moment' }, { status: 500 });
    }

    console.log(`[backfill] Generated thumbnail for moment ${momentId}: ${thumbnailUrl}`);
    return NextResponse.json({ success: true, thumbnailUrl, momentId });
  }

  // Mode 2: Auto-backfill Cloudflare Stream videos
  const batchSize = Math.min(body.batchSize ?? 50, 200);

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
      message: 'No CF videos to backfill',
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
    message: `Backfilled ${updated} CF video thumbnails`,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 10), // Only return first 10 errors
  });
}
