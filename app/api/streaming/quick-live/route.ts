import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLiveInput, isCloudflareStreamConfigured } from '@/lib/cloudflare-stream';

/**
 * Generate a URL-safe slug from a title
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Quick Go Live - creates a minimal event and starts streaming
 *
 * This endpoint allows users to go live with just a title.
 * It creates:
 * 1. A minimal event (starts now, ends in 4 hours, is_online=true)
 * 2. A live_stream record linked to that event
 * 3. A Cloudflare live input for streaming
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!isCloudflareStreamConfigured()) {
    return NextResponse.json({ error: 'Streaming service not configured' }, { status: 503 });
  }

  const body = await request.json();
  const { title } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const trimmedTitle = title.trim();
  const slug = generateSlug(trimmedTitle);
  const now = new Date();
  const endsAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now

  // Create the minimal event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      slug,
      title: trimmedTitle,
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: user.id,
      status: 'published',
      is_online: true,
      timezone: 'Asia/Ho_Chi_Minh',
    })
    .select('id, slug, title')
    .single();

  if (eventError) {
    console.error('Failed to create quick event:', eventError);

    // Handle slug conflict by retrying with a different suffix
    if (eventError.code === '23505') {
      const retrySlug = generateSlug(trimmedTitle);
      const { data: retryEvent, error: retryError } = await supabase
        .from('events')
        .insert({
          slug: retrySlug,
          title: trimmedTitle,
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: user.id,
          status: 'published',
          is_online: true,
          timezone: 'Asia/Ho_Chi_Minh',
        })
        .select('id, slug, title')
        .single();

      if (retryError) {
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
      }

      // Continue with retry event
      return continueWithStream(supabase, retryEvent, user.id);
    }

    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }

  return continueWithStream(supabase, event, user.id);
}

async function continueWithStream(
  supabase: Awaited<ReturnType<typeof createClient>>,
  event: { id: string; slug: string; title: string },
  userId: string
) {
  try {
    // Create Cloudflare live input
    const liveInput = await createLiveInput({
      meta: { eventId: event.id, eventTitle: event.title, broadcasterId: userId },
      recording: { mode: 'automatic', timeoutSeconds: 30 },
    });

    // Create the live_stream record
    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .insert({
        event_id: event.id,
        broadcaster_id: userId,
        cf_live_input_id: liveInput.uid,
        cf_stream_key: liveInput.rtmps.streamKey,
        cf_playback_url: liveInput.webRTCPlayback,
        angle_label: 'Main',
        status: 'idle',
      })
      .select('id')
      .single();

    if (streamError) {
      console.error('Failed to create stream record:', streamError);
      // Clean up: delete the event we just created
      await supabase.from('events').delete().eq('id', event.id);
      return NextResponse.json({ error: 'Failed to create stream' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      eventSlug: event.slug,
      eventId: event.id,
      streamId: stream.id,
    });
  } catch (error) {
    console.error('Cloudflare Stream error:', error);
    // Clean up: delete the event we just created
    await supabase.from('events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Failed to create live input' }, { status: 500 });
  }
}
