import { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { allLocales } from "@/lib/i18n/config";
import { getMonthSlug, isPastMonth } from "@/lib/events/archive-utils";
import {
  FLOWER_FESTIVAL_2026_PATH,
  FLOWER_FESTIVAL_LAST_CHECKED,
  FLOWER_FESTIVAL_PATH,
} from "@/lib/festivals/da-lat-flower-festival";
import {
  EVENT_INDEXABLE_TRANSLATION_FIELDS,
  evaluateEventIndexingReadinessBatch,
  type EventIndexingSource,
  type EventIndexingTranslationRow,
} from "@/lib/translations-readiness";
import { getNewsPageModifiedAt } from "@/lib/news/article-policy";

const MAX_SITEMAP_URLS = 50_000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

/**
 * Emit every localized canonical as its own <loc>. Reciprocal hreflang remains
 * in page HTML; duplicating the same 12-link hreflang cluster on all 12 sitemap
 * entries would exceed Google's 50 MB uncompressed sitemap limit, and Google
 * recommends choosing one hreflang implementation rather than maintaining all.
 */
type EntryOptions = {
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
  images?: string[];
};

function localeUrl(locale: string, path: string): string {
  const normalizedPath = path && !path.startsWith("/") ? `/${path}` : path;
  const cleanPath = normalizedPath === "/" ? "" : normalizedPath;
  return locale === "en"
    ? `https://dalat.app${cleanPath}`
    : `https://dalat.app/${locale}${cleanPath}`;
}

/**
 * The default locale is unprefixed (`/en/...` redirects), while every other
 * locale uses its canonical prefix.
 */
export function localizedEntries(
  path: string,
  { lastModified, changeFrequency, priority, images }: EntryOptions = {},
): MetadataRoute.Sitemap {
  return allLocales.map((locale) =>
    localeEntry(locale, path, {
      lastModified,
      changeFrequency,
      priority,
      images,
    }),
  );
}

function localeEntry(
  locale: string,
  path: string,
  { lastModified, changeFrequency, priority, images }: EntryOptions = {},
): MetadataRoute.Sitemap[number] {
  return {
    url: localeUrl(locale, path),
    ...(lastModified ? { lastModified } : {}),
    ...(changeFrequency ? { changeFrequency } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(images?.length ? { images } : {}),
  };
}

/**
 * Image sitemap locations must be absolute, crawlable URLs. Invalid or
 * credential-bearing values are omitted instead of risking a malformed
 * sitemap. Each localized canonical can declare the same source image without
 * introducing redirecting or credential-bearing image URLs.
 */
function sitemapImages(imageUrl: string | null): string[] | undefined {
  if (!imageUrl?.trim()) return undefined;

  try {
    const url = new URL(imageUrl.trim());
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (url.username || url.password) return undefined;

    url.hash = "";
    return [url.toString()];
  } catch {
    return undefined;
  }
}

/**
 * Fail closed before Next serializes an invalid sitemap. The byte calculation
 * deliberately overestimates the compact XML representation, leaving ample
 * room for the XML header and escaping.
 */
export function assertSitemapLimits(entries: MetadataRoute.Sitemap): void {
  if (entries.length > MAX_SITEMAP_URLS) {
    throw new Error(
      `sitemap: ${entries.length} URLs exceed the ${MAX_SITEMAP_URLS} URL limit`,
    );
  }

  const estimatedBytes = estimateSitemapBytes(entries);
  if (estimatedBytes > MAX_SITEMAP_BYTES) {
    throw new Error(
      `sitemap: estimated ${estimatedBytes} bytes exceed the ${MAX_SITEMAP_BYTES} byte limit`,
    );
  }
}

export function estimateSitemapBytes(entries: MetadataRoute.Sitemap): number {
  const encoder = new TextEncoder();
  return entries.reduce(
    (total, item) =>
      total +
      encoder.encode(item.url).byteLength +
      (item.images ?? []).reduce(
        (imageTotal, imageUrl) =>
          imageTotal + encoder.encode(imageUrl).byteLength + 64,
        0,
      ) +
      256,
    512,
  );
}

export function latestSitemapLastModified(
  sourceUpdatedAt: string,
  localeTranslationUpdatedAt: string | null,
): Date {
  const sourceDate = new Date(sourceUpdatedAt);
  const translationDate = localeTranslationUpdatedAt
    ? new Date(localeTranslationUpdatedAt)
    : null;

  return translationDate &&
    Number.isFinite(translationDate.getTime()) &&
    translationDate > sourceDate
    ? translationDate
    : sourceDate;
}

/** A failed query MUST fail the sitemap — `?? []` silently shipped a sitemap
 * with ZERO event pages for months (the query referenced a dropped column). */
function unwrap<T>(
  name: string,
  result: { data: T | null; error: { message: string } | null },
): T {
  if (result.error) {
    throw new Error(`sitemap: ${name} query failed: ${result.error.message}`);
  }
  return (result.data ?? []) as T;
}

/**
 * PostgREST caps responses at 1,000 rows by default. Page deterministically so
 * an event locale is never omitted merely because its translation rows landed
 * beyond the first response page.
 */
export async function fetchAllEventIndexingTranslations(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<EventIndexingTranslationRow[]> {
  const rows: EventIndexingTranslationRow[] = [];
  const pageSize = 1_000;
  const uniqueIds = [...new Set(eventIds)].filter(Boolean);

  for (let chunkStart = 0; chunkStart < uniqueIds.length; chunkStart += 50) {
    const idChunk = uniqueIds.slice(chunkStart, chunkStart + 50);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("content_translations")
        .select(
          "content_id, target_locale, field_name, translated_text, updated_at",
        )
        .eq("content_type", "event")
        .in("content_id", idChunk)
        .in("field_name", [...EVENT_INDEXABLE_TRANSLATION_FIELDS])
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(
          `sitemap: event translations query failed: ${error.message}`,
        );
      }

      const page = (data ?? []) as EventIndexingTranslationRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sitemapServiceClient =
    serviceRoleKey && supabaseUrl
      ? createSupabaseClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  // Static pages that exist for all locales.
  // Deliberately absent: /settings and /auth/login (robots-disallowed private
  // pages) and /events/new (a creation form is not indexable content).
  // No lastModified on static pages — a fabricated "changed every build"
  // timestamp erodes Google's trust in the sitemap's lastmod signal.
  const staticPages = [
    { path: "", priority: 1.0, changeFrequency: "daily" as const },
    { path: "/moments", priority: 0.7, changeFrequency: "daily" as const },
    {
      path: "/events/this-month",
      priority: 0.8,
      changeFrequency: "daily" as const,
    },
    {
      path: "/events/this-week",
      priority: 0.8,
      changeFrequency: "daily" as const,
    },
    {
      path: "/events/upcoming",
      priority: 0.85,
      changeFrequency: "daily" as const,
    },

    // ============================================
    // SEO LANDING PAGES - High-value keyword targets
    // ============================================

    // Time-based pages (high intent, fresh content)
    { path: "/this-weekend", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/tonight", priority: 0.9, changeFrequency: "hourly" as const },

    // Discovery pages
    {
      path: "/things-to-do-in-dalat",
      priority: 0.95,
      changeFrequency: "daily" as const,
    },
    { path: "/discover", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/news", priority: 0.8, changeFrequency: "hourly" as const },
    { path: "/map", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/calendar", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/venues", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/festivals", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },

    // Venue type landing pages (programmatic SEO - targets "dalat [venue type]" keywords)
    { path: "/cafes", priority: 0.85, changeFrequency: "daily" as const },
    { path: "/bars", priority: 0.85, changeFrequency: "daily" as const },
    { path: "/restaurants", priority: 0.85, changeFrequency: "daily" as const },
    { path: "/galleries", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/parks", priority: 0.75, changeFrequency: "daily" as const },
    { path: "/hotels", priority: 0.75, changeFrequency: "daily" as const },
    { path: "/coworking", priority: 0.8, changeFrequency: "daily" as const },
    {
      path: "/community-centers",
      priority: 0.7,
      changeFrequency: "daily" as const,
    },
    { path: "/outdoor", priority: 0.75, changeFrequency: "daily" as const },
    { path: "/homestays", priority: 0.75, changeFrequency: "daily" as const },
  ];

  const [
    eventsResult,
    seriesResult,
    festivalsResult,
    organizersResult,
    venuesResult,
    tribesResult,
    monthsResult,
    momentsResult,
    blogPostsResult,
    playlistsResult,
  ] = await Promise.all([
    // ALL published events, past included — past-event pages (with their
    // moments galleries) are evergreen assets, not expired inventory.
    // RLS already hides drafts and members-only content from this anon-context
    // client, i.e. the sitemap sees exactly what a crawler can see.
    supabase
      .from("events")
      .select(
        "id, slug, title, description, starts_at, ends_at, location_name, address, venue_id, is_online, online_link, image_url, tribe_id, tribe_visibility, source_locale, status, updated_at",
      )
      .eq("status", "published")
      .order("starts_at", { ascending: false }),
    supabase
      .from("event_series")
      .select("slug, updated_at, image_url")
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    supabase.from("festivals").select("slug, updated_at"),
    supabase.from("organizers").select("slug, updated_at"),
    supabase.from("venues").select("slug, updated_at"),
    // Same discoverability gate as the tribes browse filter + tribe page noindex
    supabase
      .from("tribes")
      .select("slug, updated_at")
      .in("access_type", ["public", "request"])
      .eq("is_listed", true),
    supabase.rpc("get_months_with_events"),
    // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
    supabase
      .from("moments")
      .select(
        "id, created_at, updated_at, events!moments_event_id_fkey(slug, updated_at)",
      )
      .eq("status", "published"),
    supabase
      .from("blog_posts")
      .select(
        "slug, source, published_at, updated_at, source_urls, blog_categories(slug)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false }),
    // Audio content: Playlists and tracks with lyrics for SEO
    supabase
      .from("event_playlists")
      .select(
        `
        updated_at,
        events!inner(slug, status, updated_at),
        playlist_tracks(id, title, artist, lyrics_lrc, updated_at)
      `,
      )
      .eq("events.status", "published"),
  ]);
  // The current get_news_posts RPC runs with invoker RLS, so anon callers do
  // not see experimental rows even though the SQL predicate names them. This
  // narrowly scoped server-only read exposes only established experimental
  // news_scrape URLs to the regular sitemap, including legacy pages whose old
  // category must remain unchanged. Drafts and manual experiments stay private.
  const publicAutomatedResult = sitemapServiceClient
    ? await sitemapServiceClient
        .from("blog_posts")
        .select(
          "slug, source, published_at, updated_at, source_urls, blog_categories(slug)",
        )
        .eq("source", "news_scrape")
        .eq("status", "experimental")
        .limit(1000)
    : { data: [], error: null };

  const events = unwrap("events", eventsResult);
  const eventTranslationRows = await fetchAllEventIndexingTranslations(
    supabase,
    events.map((event) => event.id),
  );
  const eventReadiness = evaluateEventIndexingReadinessBatch(
    events as EventIndexingSource[],
    eventTranslationRows,
  );
  const series = unwrap("series", seriesResult);
  const festivals = unwrap("festivals", festivalsResult);
  const organizers = unwrap("organizers", organizersResult);
  const venues = unwrap("venues", venuesResult);
  const tribes = unwrap("tribes", tribesResult);
  const monthsWithEvents = unwrap("months", monthsResult) as {
    year: number;
    month: number;
    event_count: number;
  }[];
  const momentsRaw = unwrap("moments", momentsResult);
  const blogPostsRaw = unwrap("blog_posts", blogPostsResult);
  const blogPosts = blogPostsRaw.map((p) => {
    const categories = p.blog_categories;
    const category = Array.isArray(categories) ? categories[0] : categories;
    return {
      slug: p.slug as string,
      published_at: p.published_at as string,
      updated_at: (p.source === "news_scrape"
        ? getNewsPageModifiedAt(p)
        : p.updated_at) as string,
      category_slug: (category as { slug: string } | null)?.slug ?? "changelog",
    };
  });
  const blogPostKeys = new Set(
    blogPosts.map((post) => `${post.category_slug}/${post.slug}`),
  );
  const publicAutomated = unwrap(
    "public_automated",
    publicAutomatedResult,
  ) as Array<{
    slug: string;
    source: string;
    published_at: string | null;
    updated_at: string | null;
    source_urls: unknown;
    blog_categories: { slug: string } | Array<{ slug: string }> | null;
  }>;
  for (const post of publicAutomated) {
    const categories = post.blog_categories;
    const category = Array.isArray(categories) ? categories[0] : categories;
    const categorySlug = category?.slug ?? "changelog";
    const key = `${categorySlug}/${post.slug}`;
    if (blogPostKeys.has(key)) continue;
    blogPostKeys.add(key);
    blogPosts.push({
      slug: post.slug,
      published_at: post.published_at as string,
      updated_at: (getNewsPageModifiedAt(post) ?? post.published_at) as string,
      category_slug: categorySlug,
    });
  }

  // Process playlists for audio sitemap entries
  const playlistsRaw = unwrap("playlists", playlistsResult);
  type PlaylistRow = {
    updated_at: string;
    events:
      | { slug: string; status: string; updated_at: string }
      | { slug: string; status: string; updated_at: string }[];
    playlist_tracks: Array<{
      id: string;
      title: string | null;
      artist: string | null;
      lyrics_lrc: string | null;
      updated_at: string;
    }>;
  };
  const playlists = (playlistsRaw as PlaylistRow[])
    .map((p) => {
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
    })
    .filter((p) => p.eventSlug && p.tracks.length > 0);
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
    sitemapEntries.push(
      ...localizedEntries(page.path, {
        changeFrequency: page.changeFrequency,
        priority: page.priority,
      }),
    );
  }

  const flowerFestivalLastModified = new Date(
    `${FLOWER_FESTIVAL_LAST_CHECKED}T00:00:00+07:00`,
  );
  for (const path of [FLOWER_FESTIVAL_PATH, FLOWER_FESTIVAL_2026_PATH]) {
    sitemapEntries.push(
      ...localizedEntries(path, {
        lastModified: flowerFestivalLastModified,
        changeFrequency: "weekly",
        priority: 0.9,
      }),
    );
  }

  // Add events
  for (const event of events) {
    const readiness = eventReadiness.get(event.id);
    if (!readiness) continue;

    for (const locale of readiness.locales) {
      if (!locale.ready) continue;
      sitemapEntries.push(
        localeEntry(locale.locale, `/events/${event.slug}`, {
          lastModified: latestSitemapLastModified(
            event.updated_at,
            locale.translationUpdatedAt,
          ),
          changeFrequency: "weekly",
          priority: 0.8,
          images: sitemapImages(event.image_url),
        }),
      );
    }
  }

  // Add active recurring activity series. Paused and cancelled series remain
  // reachable by direct link but should not be advertised as current supply.
  for (const item of series) {
    sitemapEntries.push(
      ...localizedEntries(`/series/${item.slug}`, {
        lastModified: new Date(item.updated_at),
        changeFrequency: "weekly",
        priority: 0.75,
        images: sitemapImages(item.image_url),
      }),
    );
  }

  // Add festivals
  for (const festival of festivals) {
    sitemapEntries.push(
      ...localizedEntries(`/festivals/${festival.slug}`, {
        lastModified: new Date(festival.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    );
  }

  // Add organizers (unified vanity URLs — /organizers/[slug] 301s to /[slug])
  for (const organizer of organizers) {
    sitemapEntries.push(
      ...localizedEntries(`/${organizer.slug}`, {
        lastModified: new Date(organizer.updated_at),
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    );
  }

  // Add venues (unified vanity URLs — /venues/[slug] 301s to /[slug])
  for (const venue of venues) {
    sitemapEntries.push(
      ...localizedEntries(`/${venue.slug}`, {
        lastModified: new Date(venue.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    );
  }

  // Add tribes (discoverable only; secret/unlisted tribes are noindex'd)
  for (const tribe of tribes) {
    sitemapEntries.push(
      ...localizedEntries(`/tribes/${tribe.slug}`, {
        lastModified: new Date(tribe.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    );
  }

  // Add monthly archive pages
  for (const { year, month } of monthsWithEvents) {
    const monthSlug = getMonthSlug(month);
    const past = isPastMonth(year, month);
    sitemapEntries.push(
      ...localizedEntries(`/events/${year}/${monthSlug}`, {
        changeFrequency: past ? "monthly" : "daily",
        priority: past ? 0.5 : 0.7,
      }),
    );
  }

  // Add moments at their canonical event-scoped URL — /moments/[id] 301s to
  // /events/[slug]/moments/[id], and sitemaps must never list redirecting URLs
  for (const moment of moments) {
    if (!moment.events?.slug) continue;
    sitemapEntries.push(
      ...localizedEntries(
        `/events/${moment.events.slug}/moments/${moment.id}`,
        {
          lastModified: new Date(moment.updated_at || moment.created_at),
          changeFrequency: "weekly",
          priority: 0.6,
        },
      ),
    );
  }

  // Add event moments galleries
  const eventMomentSlugs = new Map<string, string>();
  moments.forEach((moment) => {
    if (moment.events?.slug) {
      eventMomentSlugs.set(
        moment.events.slug,
        moment.events.updated_at || moment.updated_at,
      );
    }
  });

  for (const [slug, updatedAt] of eventMomentSlugs.entries()) {
    sitemapEntries.push(
      ...localizedEntries(`/events/${slug}/moments`, {
        lastModified: new Date(updatedAt),
        changeFrequency: "weekly",
        priority: 0.55,
      }),
    );
  }

  // Add blog list page
  sitemapEntries.push(
    ...localizedEntries("/blog", {
      changeFrequency: "daily",
      priority: 0.7,
    }),
  );

  // Add blog posts
  for (const post of blogPosts) {
    sitemapEntries.push(
      ...localizedEntries(`/blog/${post.category_slug}/${post.slug}`, {
        ...(post.updated_at || post.published_at
          ? { lastModified: new Date(post.updated_at || post.published_at) }
          : {}),
        changeFrequency: "monthly",
        priority: 0.65,
      }),
    );
  }

  // ============================================
  // AUDIO CONTENT (SEO for music/karaoke)
  // ============================================
  // Note: per-track /download pages are deliberately NOT in the sitemap — a
  // nested-loop bug once emitted them tracks² times (~96k of 109k URLs) and
  // they're thin utility pages, not search content.

  for (const playlist of playlists) {
    sitemapEntries.push(
      ...localizedEntries(`/events/${playlist.eventSlug}/playlist`, {
        lastModified: new Date(
          playlist.playlistUpdatedAt || playlist.eventUpdatedAt,
        ),
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    );

    // Lyrics and karaoke pages for tracks with lyrics
    for (const track of playlist.tracks) {
      if (!track.hasLyrics) continue;

      sitemapEntries.push(
        ...localizedEntries(
          `/events/${playlist.eventSlug}/lyrics/${track.id}`,
          {
            lastModified: new Date(track.updatedAt),
            changeFrequency: "monthly",
            priority: 0.75,
          },
        ),
      );

      sitemapEntries.push(
        ...localizedEntries(
          `/events/${playlist.eventSlug}/karaoke/${track.id}`,
          {
            lastModified: new Date(track.updatedAt),
            changeFrequency: "monthly",
            priority: 0.7,
          },
        ),
      );
    }
  }

  assertSitemapLimits(sitemapEntries);
  return sitemapEntries;
}
