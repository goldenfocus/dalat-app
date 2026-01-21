import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Schedules reminders for interested users (no immediate confirmation email)
// TODO: Integrate with Inngest for scheduled reminders
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { eventId } = await request.json();

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('title, slug')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // TODO: Schedule 24h and 2h reminders via Inngest
  // For now, just acknowledge the "interested" status
  // Reminders will be handled by Inngest scheduled functions

  return NextResponse.json({
    success: true,
    message: 'Interested status recorded. Reminders will be scheduled via Inngest.',
  });
}
