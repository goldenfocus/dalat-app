import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyRsvpConfirmation, notifyOrganizerNewRsvp } from '@/lib/notifications';
import { inngest } from '@/lib/inngest';
import type { Locale } from '@/lib/types';

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { eventId, rsvpStatus } = await request.json();

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase
      .from('profiles')
      .select('locale, display_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('events')
      .select('title, slug, description, starts_at, ends_at, location_name, google_maps_url, created_by')
      .eq('id', eventId)
      .single(),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const locale = (profile?.locale as Locale) || 'en';

  console.log('[rsvp-notification] Starting for user:', user.id, 'event:', event.slug);

  try {
    // Send immediate RSVP confirmation
    console.log('[rsvp-notification] Sending confirmation...');
    const result = await notifyRsvpConfirmation(
      user.id,
      locale,
      event.title,
      event.slug,
      event.description
    );
    console.log('[rsvp-notification] Confirmation sent:', result);

    // Notify organizer (if not self-RSVP and status is 'going')
    if (rsvpStatus === 'going' && event.created_by !== user.id) {
      const { data: organizerProfile } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', event.created_by)
        .single();

      await notifyOrganizerNewRsvp(
        event.created_by,
        (organizerProfile?.locale as Locale) || 'en',
        event.title,
        profile?.display_name || 'Someone',
        event.slug
      );
      console.log('[rsvp-notification] Organizer notified of new RSVP');
    }

    // Schedule reminders via Inngest
    await inngest.send({
      name: 'rsvp/created',
      data: {
        userId: user.id,
        locale,
        eventId,
        eventTitle: event.title,
        eventSlug: event.slug,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        locationName: event.location_name,
        googleMapsUrl: event.google_maps_url,
      },
    });
    console.log('[rsvp-notification] Scheduled reminders via Inngest');

    return NextResponse.json({ success: true, notificationResult: result });
  } catch (error) {
    console.error('[rsvp-notification] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
