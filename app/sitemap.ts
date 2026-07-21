import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { allLocales } from '@/lib/i18n/config';
import { getMonthSlug, isPastMonth } from '@/lib/events/archive-utils';

const baseUrl = 'https://dalat.app';
const defaultLocale = 'en';

/**
 * Absolute URL honoring localePrefix 'as-needed': the default locale lives at
 * the root — /en/... 307-redirects, and search engines treat sitemap URLs and
 * hreflang alternates that redirect as broken.
 */
function localeUrl(locale: string, path: string): string {
  return locale === defaultLocale
    ? `${baseUrl}${path}` || baseUrl
    : `${baseUrl}/${locale}${path}`;
}

type EntryOptions = {
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority?: number;
};

/**
 * ONE sitemap entry per page (the spec'd shape): canonical URL + hreflang
 * alternates for all 12 locales + x-default. Emitting a separate entry per
 * locale (the old behavior) inflated the sitemap 12x toward the 50k cap.
 */
function entry(path: string, { lastModified, changeFrequency, priority }: EntryOptions): MetadataRoute.Sitemap[number] {
  const languages: Record<string, string> = {};
  for (const locale of allLocales) {
    languages[locale] = localeUrl(locale, path);
  }
  languages['x-default'] = localeUrl(defaultLocale, path);

  return {
    url: localeUrl(defaultLocale, path),
    ...(lastModified ? { lastModified } : {}),
    ...(changeFrequency ? { changeFrequency } : {}),
    ...(priority !== undefined ? { priority } : {}),
    alternates: { languages },
  };
}

/** A failed query MUST fail the sitemap — `?? []` silently shipped a sitemap
 * with ZERO event pages for months (the query referenced a dropped column). */
function unwrap<T>(name: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(`sitemap: ${name} query failed: ${result.error.message}`);
  }
  return (result.data ?? []) as T;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Static pages that exist for all locales.
  // Deliberately absent: /settings and /auth/login (robots-disallowed private
  // pages) and /events/new (a creation form is not indexable content).
  // No lastModified on static pages — a fabricated "changed every build"
  // timestamp erodes Google's trust in the sitemap's lastmod signal.
  const staticPages = [
    { path: '', priority: 1.0, changeFrequency: 'daily' as const },
    { path: '/moments', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/events/this-month', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/events/this-week', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/events/upcoming', priority: 0.85, changeFrequency: 'daily' as const },

    // ============================================
    // SEO LANDING PAGES - High-value keyword targets
    // ============================================

    // Time-based pages (high intent, fresh content)
    { path: '/this-weekend', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/tonight', priority: 0.9, changeFrequency: 'hourly' as const },

    // Discovery pages
    { path: '/discover', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/map', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/calendar', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/venues', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/festivals', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: '/about', priority: 0.6, changeFrequency: 'monthly' as const },

    // Venue type landing pages (programmatic SEO - targets "dalat [venue type]" keywords)
    { path: '/cafes', priority: 0.85, changeFrequency: 'daily' as const },
    { path: '/bars', priority: 0.85, changeFrequency: 'daily' as const },
    { path: '/restaurants', priority: 0.85, changeFrequency: 'daily' as const },
    { path: '/galleries', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/parks', priority: 0.75, changeFrequency: 'daily' as const },
    { path: '/hotels', priority: 0.75, changeFrequency: 'daily' as const },
    { path: '/coworking', priority: 0.8, changeFrequency: 'daily' as const },
    { path: '/community-centers', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/outdoor', priority: 0.75, changeFrequency: 'daily' as const },
    { path: '/homestays', priority: 0.75, changeFrequency: 'daily' as const },
  ];

  const [eventsResult, festivalsResult, organizersResult, venuesResult, tribesResult, monthsResult, momentsResult, blogPostsResult, playlistsResult] = await Promise.all([
    // ALL published events, past included — past-event pages (with their
    // moments galleries) are evergreen assets, not expired inventory.
    // RLS already hides drafts and members-only content from this anon-context
    // client, i.e. the sitemap sees exactly what a crawler can see.
    supabase
      .from('events')
      .select('slug, updated_at')
      .eq('status', 'published')
      .order('starts_at', { ascending: false }),
    supabase
      .from('festivals')
      .select('slug, updated_at'),
    supabase
      .from('organizers')
      .select('slug, updated_at'),
    supabase
      .from('venues')
      .select('slug, updated_at'),
    // Same discoverability gate as the tribes browse filter + tribe page noindex
    supabase
      .from('tribes')
      .select('slug, updated_at')
      .in('access_type', ['public', 'request'])
      .eq('is_listed', true),
    supabase.rpc('get_months_with_events'),
    // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
    supabase
      .from('moments')
      .select('id, created_at, updated_at, events!moments_event_id_fkey(slug, updated_at)')
      .eq('status', 'published'),
    supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at, blog_categories(slug)')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
    // Audio content: Playlists and tracks with lyrics for SEO
    supabase
      .from('event_playlists')
      .select(`
        updated_at,
        events!inner(slug, status, updated_at),
        playlist_tracks(id, title, artist, lyrics_lrc, updated_at)
      `)
      .eq('events.status', 'published'),
  ]);

  const events = unwrap('events', eventsResult);
  const festivals = unwrap('festivals', festivalsResult);
  const organizers = unwrap('organizers', organizersResult);
  const venues = unwrap('venues', venuesResult);
  const tribes = unwrap('tribes', tribesResult);
  const monthsWithEvents = unwrap('months', monthsResult) as { year: number; month: number; event_count: number }[];
  const momentsRaw = unwrap('moments', momentsResult);
  const blogPostsRaw = unwrap('blog_posts', blogPostsResult);
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

  // Process playlists for audio sitemap entries
  const playlistsRaw = unwrap('playlists', playlistsResult);
  type PlaylistRow = {
    updated_at: string;
    events: { slug: string; status: string; updated_at: string } | { slug: string; status: string; updated_at: string }[];
    playlist_tracks: Array<{ id: string; title: string | null; artist: string | null; lyrics_lrc: string | null; updated_at: string }>;
  };
  const playlists = (playlistsRaw as PlaylistRow[]).map((p) => {
    const event = Array.isArray(p.events) ? p.events[0] : p.events;
    return {
      eventSlug: event?.slug as string,
      eventUpdatedAt: event?.updated_at as string,
      playlistUpdatedAt: p.updated_at as string,
      tracks: (p.playlist_tracks || []).map((t) => ({
        id: t.id as string,
        title: t.title,
        artist: t.artist,
        hasLyrics: !!t.lyrics_lrc,
        updatedAt: t.updated_at as string,
      })),
    };
  }).filter((p) => p.eventSlug && p.tracks.length > 0);
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

  // Add static pages
  for (const page of staticPages) {
    sitemapEntries.push(entry(page.path, {
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }));
  }

  // Add events
  for (const event of events) {
    sitemapEntries.push(entry(`/events/${event.slug}`, {
      lastModified: new Date(event.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  }

  // Add festivals
  for (const festival of festivals) {
    sitemapEntries.push(entry(`/festivals/${festival.slug}`, {
      lastModified: new Date(festival.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  }

  // Add organizers (unified vanity URLs — /organizers/[slug] 301s to /[slug])
  for (const organizer of organizers) {
    sitemapEntries.push(entry(`/${organizer.slug}`, {
      lastModified: new Date(organizer.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  }

  // Add venues (unified vanity URLs — /venues/[slug] 301s to /[slug])
  for (const venue of venues) {
    sitemapEntries.push(entry(`/${venue.slug}`, {
      lastModified: new Date(venue.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  }

  // Add tribes (discoverable only; secret/unlisted tribes are noindex'd)
  for (const tribe of tribes) {
    sitemapEntries.push(entry(`/tribes/${tribe.slug}`, {
      lastModified: new Date(tribe.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  }

  // Add monthly archive pages
  for (const { year, month } of monthsWithEvents) {
    const monthSlug = getMonthSlug(month);
    const past = isPastMonth(year, month);
    sitemapEntries.push(entry(`/events/${year}/${monthSlug}`, {
      changeFrequency: past ? 'monthly' : 'daily',
      priority: past ? 0.5 : 0.7,
    }));
  }

  // Add moments at their canonical event-scoped URL — /moments/[id] 301s to
  // /events/[slug]/moments/[id], and sitemaps must never list redirecting URLs
  for (const moment of moments) {
    if (!moment.events?.slug) continue;
    sitemapEntries.push(entry(`/events/${moment.events.slug}/moments/${moment.id}`, {
      lastModified: new Date(moment.updated_at || moment.created_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  }

  // Add event moments galleries
  const eventMomentSlugs = new Map<string, string>();
  moments.forEach((moment) => {
    if (moment.events?.slug) {
      eventMomentSlugs.set(moment.events.slug, moment.events.updated_at || moment.updated_at);
    }
  });

  for (const [slug, updatedAt] of eventMomentSlugs.entries()) {
    sitemapEntries.push(entry(`/events/${slug}/moments`, {
      lastModified: new Date(updatedAt),
      changeFrequency: 'weekly',
      priority: 0.55,
    }));
  }

  // Add blog list page
  sitemapEntries.push(entry('/blog', {
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // Add blog posts
  for (const post of blogPosts) {
    sitemapEntries.push(entry(`/blog/${post.category_slug}/${post.slug}`, {
      lastModified: new Date(post.updated_at || post.published_at),
      changeFrequency: 'monthly',
      priority: 0.65,
    }));
  }

  // ============================================
  // AUDIO CONTENT (SEO for music/karaoke)
  // ============================================
  // Note: per-track /download pages are deliberately NOT in the sitemap — a
  // nested-loop bug once emitted them tracks² times (~96k of 109k URLs) and
  // they're thin utility pages, not search content.

  for (const playlist of playlists) {
    sitemapEntries.push(entry(`/events/${playlist.eventSlug}/playlist`, {
      lastModified: new Date(playlist.playlistUpdatedAt || playlist.eventUpdatedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    // Lyrics and karaoke pages for tracks with lyrics
    for (const track of playlist.tracks) {
      if (!track.hasLyrics) continue;

      sitemapEntries.push(entry(`/events/${playlist.eventSlug}/lyrics/${track.id}`, {
        lastModified: new Date(track.updatedAt),
        changeFrequency: 'monthly',
        priority: 0.75,
      }));

      sitemapEntries.push(entry(`/events/${playlist.eventSlug}/karaoke/${track.id}`, {
        lastModified: new Date(track.updatedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
      }));
    }
  }

  return sitemapEntries;
}
