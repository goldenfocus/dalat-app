import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Place Directory API
 *
 * Machine-readable JSON directory of venues and places in Da Lat.
 * Useful for AI assistants answering "where to go in Dalat" queries.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: venues, error } = await supabase
    .from('venues')
    .select(`
      id, name, slug, description, address,
      latitude, longitude, venue_type, cover_image_url,
      google_maps_url
    `)
    .order('name', { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch places' }, { status: 500 });
  }

  const feed = {
    title: 'Places in Da Lat',
    description: 'Directory of venues, cafes, restaurants, and points of interest in Da Lat, Vietnam.',
    website: 'https://dalat.app',
    generated_at: new Date().toISOString(),
    total_count: venues?.length ?? 0,
    places: (venues ?? []).map((venue) => ({
      id: venue.id,
      name: venue.name,
      url: `https://dalat.app/venues/${venue.slug}`,
      type: venue.venue_type,
      description: venue.description?.slice(0, 200),
      address: venue.address,
      coordinates: venue.latitude && venue.longitude
        ? { latitude: venue.latitude, longitude: venue.longitude }
        : null,
      cover_image: venue.cover_image_url,
      google_maps: venue.google_maps_url,
    })),
  };

  return NextResponse.json(feed, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
