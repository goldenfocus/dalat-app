import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyRsvpConfirmation, scheduleEventReminders, scheduleFeedbackRequest } from '@/lib/novu';
import type { Locale } from '@/lib/types';

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

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase
      .from('profiles')
      .select('locale')
      .eq('id', user.id)
      .single(),
    supabase
      .from('events')
      .select('title, slug, description, starts_at, ends_at, location_name, google_maps_url')
      .eq('id', eventId)
      .single(),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const locale = (profile?.locale as Locale) || 'en';

  try {
    // Send immediate RSVP confirmation
    await notifyRsvpConfirmation(
      user.id,
      locale,
      event.title,
      event.slug,
      event.description
    );

    // Schedule 24h and 2h reminders + feedback request (all in parallel)
    const [reminders, feedback] = await Promise.all([
      scheduleEventReminders(
        user.id,
        locale,
        eventId,
        event.title,
        event.slug,
        event.starts_at,
        event.location_name,
        event.google_maps_url
      ),
      scheduleFeedbackRequest(
        user.id,
        locale,
        eventId,
        event.title,
        event.slug,
        event.starts_at,
        event.ends_at
      ),
    ]);

    return NextResponse.json({ success: true, scheduled: { ...reminders, ...feedback } });
  } catch (error) {
    console.error('RSVP notification error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
