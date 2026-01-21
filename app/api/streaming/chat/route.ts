import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { eventId, content } = body;

  if (!eventId || !content) {
    return NextResponse.json({ error: 'eventId and content are required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('send_stream_chat_message', {
    p_event_id: eventId,
    p_content: content,
  });

  if (error) {
    console.error('Failed to send chat message:', error);
    if (error.message.includes('empty_message')) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }
    if (error.message.includes('message_too_long')) {
      return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
    }
    if (error.message.includes('event_not_found')) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const before = searchParams.get('before');

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }

  const { data: messages, error } = await supabase.rpc('get_stream_chat_messages', {
    p_event_id: eventId,
    p_limit: Math.min(limit, 100),
    p_before: before || null,
  });

  if (error) {
    console.error('Failed to get chat messages:', error);
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 });
  }

  return NextResponse.json({ messages: messages || [] });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get('messageId');

  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('delete_stream_chat_message', { p_message_id: messageId });

  if (error) {
    console.error('Failed to delete message:', error);
    if (error.message.includes('message_not_found')) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (error.message.includes('not_authorized')) {
      return NextResponse.json({ error: 'Not authorized to delete this message' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}
