import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLiveInput, isCloudflareStreamConfigured } from '@/lib/cloudflare-stream';

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
  const { eventId, title, angleLabel } = body;

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, created_by, status, title')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the event creator can start a stream' }, { status: 403 });
  }

  if (event.status !== 'published') {
    return NextResponse.json({ error: 'Event must be published to start streaming' }, { status: 400 });
  }

  const { data: existingStream } = await supabase
    .from('live_streams')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('broadcaster_id', user.id)
    .single();

  if (existingStream && existingStream.status !== 'ended') {
    return NextResponse.json({ error: 'You already have an active stream for this event' }, { status: 409 });
  }

  try {
    const liveInput = await createLiveInput({
      meta: { eventId, eventTitle: event.title, broadcasterId: user.id },
      recording: { mode: 'automatic', timeoutSeconds: 30 },
    });

    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .insert({
        event_id: eventId,
        broadcaster_id: user.id,
        cf_live_input_id: liveInput.uid,
        cf_stream_key: liveInput.rtmps.streamKey,
        cf_playback_url: liveInput.webRTCPlayback,
        title: title || null,
        angle_label: angleLabel || 'Main',
        status: 'idle',
      })
      .select()
      .single();

    if (streamError) {
      console.error('Failed to create stream record:', streamError);
      return NextResponse.json({ error: 'Failed to create stream' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stream: {
        id: stream.id,
        status: stream.status,
        angleLabel: stream.angle_label,
        rtmps: { url: liveInput.rtmps.url, streamKey: liveInput.rtmps.streamKey },
        webRTC: liveInput.webRTC,
      },
    });
  } catch (error) {
    console.error('Cloudflare Stream error:', error);
    return NextResponse.json({ error: 'Failed to create live input' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }

  const { data: streams, error } = await supabase.rpc('get_event_streams', { p_event_id: eventId });

  if (error) {
    console.error('Failed to get streams:', error);
    return NextResponse.json({ error: 'Failed to get streams' }, { status: 500 });
  }

  return NextResponse.json({ streams: streams || [] });
}
