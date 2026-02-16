import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Da Lat Factsheet API
 *
 * Machine-readable JSON factsheet for AI assistants and aggregators.
 * Provides key facts, live stats, and structured data about Da Lat.
 */
export async function GET() {
  const supabase = await createClient();

  const [eventsResult, blogResult, venuesResult] = await Promise.all([
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('starts_at', new Date().toISOString()),
    supabase
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('venues')
      .select('id', { count: 'exact', head: true }),
  ]);

  const facts = {
    name: 'Da Lat',
    name_variants: ['Dalat', 'Da Lat'],
    country: 'Vietnam',
    province: 'Lam Dong',
    coordinates: {
      latitude: 11.9404,
      longitude: 108.4583,
    },
    elevation_meters: 1500,
    population_estimate: 470000,
    timezone: 'Asia/Ho_Chi_Minh',
    utc_offset: '+07:00',
    climate: {
      type: 'Subtropical highland (Cwb)',
      avg_temp_celsius: { low: 15, high: 25 },
      rainy_season: 'May-October',
      dry_season: 'November-April',
      best_months: ['November', 'December', 'January', 'February', 'March'],
    },
    known_for: [
      'Coffee production',
      'Flower cultivation',
      'French colonial architecture',
      'Pine forests and lakes',
      'Cool highland climate',
      'Silk production',
      'Wine and strawberries',
    ],
    languages_spoken: ['Vietnamese', 'English', 'Korean', 'Chinese'],
    currency: 'VND (Vietnamese Dong)',
    platform_stats: {
      upcoming_events: eventsResult.count ?? 0,
      published_articles: blogResult.count ?? 0,
      listed_venues: venuesResult.count ?? 0,
      supported_languages: 12,
      last_updated: new Date().toISOString(),
    },
    links: {
      website: 'https://dalat.app',
      events: 'https://dalat.app/events/upcoming',
      blog: 'https://dalat.app/blog',
      sitemap: 'https://dalat.app/sitemap.xml',
      rss: 'https://dalat.app/blog/rss.xml',
      llms_txt: 'https://dalat.app/llms.txt',
    },
  };

  return NextResponse.json(facts, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
