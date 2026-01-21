import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { eventId, confirmed } = await request.json();

  if (!eventId || typeof confirmed !== 'boolean') {
    return NextResponse.json({ error: 'eventId and confirmed required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('confirm_attendance', {
    p_event_id: eventId,
    p_confirmed: confirmed,
  });

  if (error) {
    console.error("Confirm attendance error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json(data);
}
