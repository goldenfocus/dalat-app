import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteLiveInput, getLiveInput } from '@/lib/cloudflare-stream';

interface RouteParams {
  params: Promise<{ streamId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { streamId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: stream, error } = await supabase
    .from('live_streams')
    .select('*, profiles!broadcaster_id (id, username, display_name, avatar_url)')
    .eq('id', streamId)
    .single();

  if (error || !stream) {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }

  const response: Record<string, unknown> = {
    id: stream.id,
    eventId: stream.event_id,
    broadcaster: stream.profiles,
    title: stream.title,
    angleLabel: stream.angle_label,
    status: stream.status,
    playbackUrl: stream.cf_playback_url,
    currentViewers: stream.current_viewers,
    peakViewers: stream.peak_viewers,
    startedAt: stream.started_at,
    endedAt: stream.ended_at,
  };

  if (user && user.id === stream.broadcaster_id && stream.cf_live_input_id) {
    try {
      const liveInput = await getLiveInput(stream.cf_live_input_id);
      response.ingest = {
        rtmps: { url: liveInput.rtmps.url, streamKey: liveInput.rtmps.streamKey },
        webRTC: liveInput.webRTC,
      };
      response.connectionStatus = liveInput.status?.current?.state ?? 'disconnected';
    } catch (error) {
      console.error('Failed to get Cloudflare live input:', error);
    }
  }

  return NextResponse.json({ stream: response });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { streamId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: stream } = await supabase
    .from('live_streams')
    .select('broadcaster_id')
    .eq('id', streamId)
    .single();

  if (!stream) {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }

  if (stream.broadcaster_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized to update this stream' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.angleLabel !== undefined) updates.angle_label = body.angleLabel;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { error: updateError } = await supabase.from('live_streams').update(updates).eq('id', streamId);

  if (updateError) {
    console.error('Failed to update stream:', updateError);
    return NextResponse.json({ error: 'Failed to update stream' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { streamId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: stream } = await supabase
    .from('live_streams')
    .select('broadcaster_id, cf_live_input_id, events!inner (created_by)')
    .eq('id', streamId)
    .single();

  if (!stream) {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }

  const isAuthorized = user.id === stream.broadcaster_id || user.id === (stream.events as { created_by: string }).created_by;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Not authorized to delete this stream' }, { status: 403 });
  }

  if (stream.cf_live_input_id) {
    try {
      await deleteLiveInput(stream.cf_live_input_id);
    } catch (error) {
      console.error('Failed to delete Cloudflare live input:', error);
    }
  }

  const { error: deleteError } = await supabase.from('live_streams').delete().eq('id', streamId);

  if (deleteError) {
    console.error('Failed to delete stream:', deleteError);
    return NextResponse.json({ error: 'Failed to delete stream' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
