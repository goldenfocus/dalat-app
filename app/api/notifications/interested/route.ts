import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';
import type { Locale } from '@/lib/types';

// Schedules reminders for interested users (no immediate confirmation email)
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

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from('events')
      .select('title, slug, starts_at')
      .eq('id', eventId)
      .single(),
    supabase
      .from('profiles')
      .select('locale')
      .eq('id', user.id)
      .single(),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const locale = (profile?.locale as Locale) || 'en';

  // Schedule reminders via Inngest (using interested event for lighter reminders)
  await inngest.send({
    name: 'rsvp/interested',
    data: {
      userId: user.id,
      locale,
      eventId,
      eventTitle: event.title,
      eventSlug: event.slug,
      startsAt: event.starts_at,
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Interested status recorded. Reminders scheduled.',
  });
}
