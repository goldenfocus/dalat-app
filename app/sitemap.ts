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
    { path: '/moments', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/events/new', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/events/this-month', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/events/this-week', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/settings', priority: 0.4, changeFrequency: 'monthly' as const },
    { path: '/auth/login', priority: 0.5, changeFrequency: 'monthly' as const },
  ];

  // Fetch dynamic content
  const recentMomentCutoff = new Date();
  recentMomentCutoff.setDate(recentMomentCutoff.getDate() - 90);

  const [eventsResult, festivalsResult, organizersResult, monthsResult, momentsResult, blogPostsResult] = await Promise.all([
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
    // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
    supabase
      .from('moments')
      .select('id, created_at, updated_at, events!moments_event_id_fkey(slug, updated_at)')
      .eq('status', 'published')
      .gte('created_at', recentMomentCutoff.toISOString()),
    supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at, blog_categories(slug)')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
  ]);

  const events = eventsResult.data ?? [];
  const festivals = festivalsResult.data ?? [];
  const organizers = organizersResult.data ?? [];
  const monthsWithEvents = (monthsResult.data ?? []) as { year: number; month: number; event_count: number }[];
  const momentsRaw = momentsResult.data ?? [];
  const blogPostsRaw = blogPostsResult.data ?? [];
  const blogPosts = blogPostsRaw.map((p) => {
    const categories = p.blog_categories;
    const category = Array.isArray(categories) ? categories[0] : categories;
    return {
      slug: p.slug as string,
      published_at: p.published_at as string,
      updated_at: p.updated_at as string,
      category_slug: ((category as { slug: string } | null)?.slug) ?? 'changelog',
    };
  });
  // Supabase returns events as array due to join typing, normalize to single object
  const moments = momentsRaw.map((m) => ({
    id: m.id as string,
    created_at: m.created_at as string,
    updated_at: m.updated_at as string,
    events: Array.isArray(m.events) ? m.events[0] : m.events,
  })) as Array<{
    id: string;
    created_at: string;
    updated_at: string;
    events?: { slug: string; updated_at: string } | null;
  }>;

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

  // Add global moments
  for (const moment of moments) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/moments/${moment.id}`,
        lastModified: new Date(moment.updated_at || moment.created_at),
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/moments/${moment.id}`])
          ),
        },
      });
    }
  }

  // Add event moments galleries
  const eventMomentSlugs = new Map<string, string>();
  moments.forEach((moment) => {
    if (moment.events?.slug) {
      eventMomentSlugs.set(moment.events.slug, moment.events.updated_at || moment.updated_at);
    }
  });

  for (const [slug, updatedAt] of eventMomentSlugs.entries()) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/events/${slug}/moments`,
        lastModified: new Date(updatedAt),
        changeFrequency: 'weekly',
        priority: 0.55,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/events/${slug}/moments`])
          ),
        },
      });
    }
  }

  // Add blog list page
  for (const locale of allLocales) {
    sitemapEntries.push({
      url: `${baseUrl}/${locale}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: {
        languages: Object.fromEntries(
          allLocales.map(l => [l, `${baseUrl}/${l}/blog`])
        ),
      },
    });
  }

  // Add blog posts
  for (const post of blogPosts) {
    for (const locale of allLocales) {
      sitemapEntries.push({
        url: `${baseUrl}/${locale}/blog/${post.category_slug}/${post.slug}`,
        lastModified: new Date(post.updated_at || post.published_at),
        changeFrequency: 'monthly',
        priority: 0.65,
        alternates: {
          languages: Object.fromEntries(
            allLocales.map(l => [l, `${baseUrl}/${l}/blog/${post.category_slug}/${post.slug}`])
          ),
        },
      });
    }
  }

  return sitemapEntries;
}
