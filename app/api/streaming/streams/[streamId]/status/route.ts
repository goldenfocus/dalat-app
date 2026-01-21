import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { LiveStreamStatus } from '@/lib/types';

interface RouteParams {
  params: Promise<{ streamId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { streamId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { status, currentViewers } = body as { status?: LiveStreamStatus; currentViewers?: number };

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  const validStatuses: LiveStreamStatus[] = ['idle', 'connecting', 'live', 'reconnecting', 'ended'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('update_stream_status', {
    p_stream_id: streamId,
    p_status: status,
    p_current_viewers: currentViewers ?? null,
  });

  if (error) {
    console.error('Failed to update stream status:', error);
    if (error.message.includes('not_authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (error.message.includes('stream_not_found')) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (error.message.includes('not_stream_owner')) {
      return NextResponse.json({ error: 'Not authorized to update this stream' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to update stream status' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}
