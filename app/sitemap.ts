import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { allLocales } from '@/lib/i18n/config';
import { getMonthSlug, isPastMonth } from '@/lib/events/archive-utils';

const baseUrl = 'https://dalat.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Static pages that exist for all locales
  const staticPages = [
    { path: '', priority: 1.0, changeFrequency: 'daily' as const },
    { path: '/events/new', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/events/this-month', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/events/this-week', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/settings', priority: 0.4, changeFrequency: 'monthly' as const },
    { path: '/auth/login', priority: 0.5, changeFrequency: 'monthly' as const },
  ];

  // Fetch dynamic content
  const [eventsResult, festivalsResult, organizersResult, monthsResult] = await Promise.all([
    supabase
      .from('events')
      .select('slug, updated_at')
      .gte('date', new Date().toISOString().split('T')[0]) // Only future events
      .order('date', { ascending: true }),
    supabase
      .from('festivals')
      .select('slug, updated_at'),
    supabase
      .from('organizers')
      .select('slug, updated_at'),
    supabase.rpc('get_months_with_events'),
  ]);

  const events = eventsResult.data ?? [];
  const festivals = festivalsResult.data ?? [];
  const organizers = organizersResult.data ?? [];
  const monthsWithEvents = (monthsResult.data ?? []) as { year: number; month: number; event_count: number }[];

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // Add static pages for all locales
  for (const page of staticPages) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}${page.path}`])
          ),
        },
      });
    }
  }

  // Add events
  for (const event of events) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/events/${event.slug}`,
        lastModified: new Date(event.updated_at),
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/events/${event.slug}`])
          ),
        },
      });
    }
  }

  // Add festivals
  for (const festival of festivals) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/festivals/${festival.slug}`,
        lastModified: new Date(festival.updated_at),
        changeFrequency: 'weekly',
        priority: 0.7,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/festivals/${festival.slug}`])
          ),
        },
      });
    }
  }

  // Add organizers
  for (const organizer of organizers) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/organizers/${organizer.slug}`,
        lastModified: new Date(organizer.updated_at),
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/organizers/${organizer.slug}`])
          ),
        },
      });
    }
  }

  // Add monthly archive pages
  for (const { year, month } of monthsWithEvents) {
    const monthSlug = getMonthSlug(month);
    const path = `/events/${year}/${monthSlug}`;
    const past = isPastMonth(year, month);

    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: past ? 'monthly' : 'daily',
        priority: past ? 0.5 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}${path}`])
          ),
        },
      });
    }
  }

  return sitemapEntries;
}
