import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyRsvpConfirmation } from '@/lib/novu';
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
      .select('title, slug, description')
      .eq('id', eventId)
      .single(),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  try {
    await notifyRsvpConfirmation(
      user.id,
      (profile?.locale as Locale) || 'en',
      event.title,
      event.slug,
      event.description
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('RSVP notification error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
