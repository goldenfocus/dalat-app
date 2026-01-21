import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyWaitlistPromotion, notifyWaitlistPositionUpdate } from '@/lib/notifications';
import { inngest } from '@/lib/inngest';
import type { Locale } from '@/lib/types';

// Called when someone cancels their RSVP - handles waitlist promotion notification
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { eventId, promotedUserId } = await request.json();

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  // Cancel any scheduled reminders for the user who cancelled
  await inngest.send({
    name: 'rsvp/cancelled',
    data: {
      userId: user.id,
      eventId,
    },
  });

  // If no one was promoted, nothing more to do
  if (!promotedUserId) {
    return NextResponse.json({ success: true, promoted: false });
  }

  // Get event details and promoted user's profile
  const [{ data: event }, { data: promotedProfile }] = await Promise.all([
    supabase
      .from('events')
      .select('title, slug, starts_at, ends_at, location_name, google_maps_url')
      .eq('id', eventId)
      .single(),
    supabase
      .from('profiles')
      .select('locale')
      .eq('id', promotedUserId)
      .single(),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const locale = (promotedProfile?.locale as Locale) || 'en';

  try {
    // Send immediate notification about promotion
    await notifyWaitlistPromotion(
      promotedUserId,
      locale,
      event.title,
      event.slug
    );

    // Schedule reminders for the promoted user via Inngest
    await inngest.send({
      name: 'rsvp/created',
      data: {
        userId: promotedUserId,
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

    // Notify remaining waitlisted users of their new position
    const { data: waitlistedUsers } = await supabase
      .from('rsvps')
      .select('user_id, profiles(locale)')
      .eq('event_id', eventId)
      .eq('status', 'waitlist')
      .order('created_at', { ascending: true });

    if (waitlistedUsers?.length) {
      await Promise.all(
        waitlistedUsers.map((user, index) => {
          const userProfile = user.profiles as unknown as { locale?: string } | null;
          const userLocale = (userProfile?.locale as Locale) || 'en';

          return notifyWaitlistPositionUpdate(
            user.user_id,
            userLocale,
            event.title,
            index + 1,
            event.slug
          );
        })
      );
    }

    return NextResponse.json({ success: true, promoted: true });
  } catch (error) {
    console.error('Waitlist promotion notification error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
