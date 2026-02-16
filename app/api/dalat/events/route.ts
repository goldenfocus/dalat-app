import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Structured Event Feed API
 *
 * Machine-readable JSON feed of upcoming events for AI assistants.
 * Returns up to 50 upcoming events with structured data.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id, slug, title, description, starts_at, ends_at,
      location_name, address, latitude, longitude,
      cover_image_url, status, rsvp_count, capacity,
      organizers(name, slug)
    `)
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  const feed = {
    title: 'Upcoming Events in Da Lat',
    description: 'Live event listings from dalat.app — the definitive event platform for Da Lat, Vietnam.',
    website: 'https://dalat.app',
    generated_at: new Date().toISOString(),
    total_count: events?.length ?? 0,
    events: (events ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description?.slice(0, 300),
      url: `https://dalat.app/events/${event.slug}`,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: {
        name: event.location_name,
        address: event.address,
        latitude: event.latitude,
        longitude: event.longitude,
      },
      cover_image: event.cover_image_url,
      rsvp_count: event.rsvp_count,
      capacity: event.capacity,
      organizer: (() => {
        const org = Array.isArray(event.organizers) ? event.organizers[0] : event.organizers;
        return org
          ? { name: (org as { name: string; slug: string }).name, url: `https://dalat.app/organizers/${(org as { name: string; slug: string }).slug}` }
          : null;
      })(),
    })),
  };

  return NextResponse.json(feed, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
