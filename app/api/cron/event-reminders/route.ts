import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyConfirmAttendance24h, notifyFinalReminder2h } from '@/lib/novu';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Locale } from '@/lib/types';

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const window = 30 * 60 * 1000; // 30 minute window

  const results = { reminder24h: 0, reminder2h: 0, errors: [] as string[] };

  // 24h reminders - events starting in ~24 hours (only if not already sent)
  const { data: events24h } = await supabase
    .from('events')
    .select(`
      id, title, slug, starts_at, timezone,
      rsvps!inner(id, user_id, status, confirmed_at, reminder_24h_sent_at, profiles(locale))
    `)
    .eq('status', 'published')
    .eq('rsvps.status', 'going')
    .is('rsvps.confirmed_at', null)
    .is('rsvps.reminder_24h_sent_at', null)
    .gte('starts_at', new Date(in24h.getTime() - window).toISOString())
    .lte('starts_at', new Date(in24h.getTime() + window).toISOString());

  for (const event of events24h || []) {
    const tz = event.timezone || 'Asia/Ho_Chi_Minh';
    const zonedTime = toZonedTime(new Date(event.starts_at), tz);
    const timeStr = format(zonedTime, 'h:mm a');

    for (const rsvp of event.rsvps || []) {
      const profile = Array.isArray(rsvp.profiles) ? rsvp.profiles[0] : rsvp.profiles;
      try {
        await notifyConfirmAttendance24h(
          rsvp.user_id,
          (profile?.locale as Locale) || 'en',
          event.title,
          timeStr,
          event.slug
        );

        await supabase
          .from('rsvps')
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq('id', rsvp.id);

        results.reminder24h++;
      } catch (e) {
        results.errors.push(`24h ${event.id}/${rsvp.user_id}: ${e}`);
      }
    }
  }

  // 2h reminders - events starting in ~2 hours (only for confirmed, not already sent)
  const { data: events2h } = await supabase
    .from('events')
    .select(`
      id, title, slug, location_name, google_maps_url,
      rsvps!inner(id, user_id, status, confirmed_at, reminder_2h_sent_at, profiles(locale))
    `)
    .eq('status', 'published')
    .eq('rsvps.status', 'going')
    .not('rsvps.confirmed_at', 'is', null)
    .is('rsvps.reminder_2h_sent_at', null)
    .gte('starts_at', new Date(in2h.getTime() - window).toISOString())
    .lte('starts_at', new Date(in2h.getTime() + window).toISOString());

  for (const event of events2h || []) {
    for (const rsvp of event.rsvps || []) {
      const profile = Array.isArray(rsvp.profiles) ? rsvp.profiles[0] : rsvp.profiles;
      try {
        await notifyFinalReminder2h(
          rsvp.user_id,
          (profile?.locale as Locale) || 'en',
          event.title,
          event.location_name || 'the venue',
          event.google_maps_url,
          event.slug
        );

        await supabase
          .from('rsvps')
          .update({ reminder_2h_sent_at: new Date().toISOString() })
          .eq('id', rsvp.id);

        results.reminder2h++;
      } catch (e) {
        results.errors.push(`2h ${event.id}/${rsvp.user_id}: ${e}`);
      }
    }
  }

  return NextResponse.json(results);
}
