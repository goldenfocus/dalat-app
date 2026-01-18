import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

export const maxDuration = 60;

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { locales, type Locale } from "@/lib/i18n/routing";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { expandSearchQuery } from "@/lib/search/expand-query";
import type { Event, EventCounts } from "@/lib/types";
import type { Metadata } from "next";

const SITE_URL = "https://dalat.app";

// Popular search terms to pre-generate for SEO
const POPULAR_SEARCHES = [
  "music",
  "yoga",
  "workshop",
  "art",
  "food",
  "coffee",
  "hiking",
  "photography",
  "meditation",
  "market",
  "festival",
  "concert",
  "dance",
  "fitness",
  "cooking",
];

type PageProps = {
  params: Promise<{ locale: Locale; query: string }>;
};

// Pre-generate pages for popular searches
export async function generateStaticParams() {
  const params: { locale: string; query: string }[] = [];

  for (const locale of locales) {
    for (const query of POPULAR_SEARCHES) {
      params.push({ locale, query });
    }
  }

  return params;
}

// Dynamic metadata based on search query
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, query } = await params;
  const decodedQuery = decodeURIComponent(query).replace(/-/g, " ");
  const t = await getTranslations({ locale, namespace: "search" });

  const title = t("title", { query: decodedQuery });
  const description = t("description", { query: decodedQuery });

  return generateLocalizedMetadata({
    locale,
    path: `/search/${query}`,
    title,
    description,
    keywords: [decodedQuery, "events", "Da Lat", "Vietnam"],
    type: "website",
  });
}

async function searchEvents(query: string): Promise<Event[]> {
  const supabase = await createClient();

  // Expand query with AI (translations + synonyms)
  const expandedTerms = await expandSearchQuery(query);

  // Build OR filter for all expanded terms
  // PostgREST reserved chars (commas, dots, parens) require double-quoted values
  // Double quotes inside values must be escaped by doubling them
  const orFilters = expandedTerms
    .map((term) => {
      const escaped = term.replace(/"/g, '""').replace(/[%_]/g, "\\$&");
      return `title.ilike."%${escaped}%",description.ilike."%${escaped}%",location_name.ilike."%${escaped}%"`;
    })
    .join(",");

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .or(orFilters)
    .order("starts_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error searching events:", error);
    return [];
  }

  return (events || []) as Event[];
}

async function getEventCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = await createClient();
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("event_id, status, plus_ones")
    .in("event_id", eventIds);

  const counts: Record<string, EventCounts> = {};

  for (const eventId of eventIds) {
    const eventRsvps = rsvps?.filter((r) => r.event_id === eventId) || [];
    const goingRsvps = eventRsvps.filter((r) => r.status === "going");
    const waitlistRsvps = eventRsvps.filter((r) => r.status === "waitlist");
    const interestedRsvps = eventRsvps.filter((r) => r.status === "interested");

    counts[eventId] = {
      event_id: eventId,
      going_count: goingRsvps.length,
      waitlist_count: waitlistRsvps.length,
      going_spots: goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0),
      interested_count: interestedRsvps.length,
    };
  }

  return counts;
}

// Categorize events by lifecycle for better UX
function categorizeEvents(events: Event[]) {
  const now = new Date();

  const upcoming: Event[] = [];
  const happening: Event[] = [];
  const past: Event[] = [];

  for (const event of events) {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : null;

    if (end && end < now) {
      past.push(event);
    } else if (start <= now && (!end || end >= now)) {
      happening.push(event);
    } else {
      upcoming.push(event);
    }
  }

  // Sort: upcoming by soonest, past by most recent
  upcoming.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  past.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return { upcoming, happening, past };
}

export default async function SearchPage({ params }: PageProps) {
  const { locale, query } = await params;
  setRequestLocale(locale);

  const decodedQuery = decodeURIComponent(query).replace(/-/g, " ");

  // Validate query
  if (!decodedQuery.trim() || decodedQuery.length > 100) {
    notFound();
  }

  const t = await getTranslations("search");
  const events = await searchEvents(decodedQuery);
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  const { upcoming, happening, past } = categorizeEvents(events);
  const totalCount = events.length;

  // Breadcrumb schema
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("breadcrumb", { query: decodedQuery }), url: `/search/${query}` },
    ],
    locale
  );

  // ItemList schema for search results (AEO/GEO optimization)
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("title", { query: decodedQuery }),
    description: t("description", { query: decodedQuery }),
    numberOfItems: totalCount,
    itemListElement: events.slice(0, 10).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/events/${event.slug}`,
      name: event.title,
      item: {
        "@type": "Event",
        name: event.title,
        startDate: event.starts_at,
        location: {
          "@type": "Place",
          name: event.location_name || "Da Lat, Vietnam",
        },
      },
    })),
  };

  // SearchAction schema (helps AI assistants understand this is a search result)
  const searchActionSchema = {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: totalCount,
    },
    about: {
      "@type": "Thing",
      name: decodedQuery,
    },
  };

  // ISR: Popular searches revalidate less often
  const isPopularSearch = POPULAR_SEARCHES.includes(decodedQuery.toLowerCase());

  return (
    <>
      <JsonLd data={[breadcrumbSchema, itemListSchema, searchActionSchema]} />

      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
            <Link
              href="/"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("back")}</span>
            </Link>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Search bar - pre-filled with current query */}
          <div className="mb-6">
            <EventSearchBar className="max-w-md" />
          </div>

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Search className="w-6 h-6 text-muted-foreground" />
              {t("resultsFor", { query: decodedQuery })}
            </h1>
            <p className="text-muted-foreground">
              {totalCount === 0
                ? t("noResults")
                : t("resultCount", { count: totalCount })}
            </p>
          </div>

          {/* Results */}
          {totalCount > 0 ? (
            <div className="space-y-8">
              {/* Happening Now */}
              {happening.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-4 text-green-600 dark:text-green-400">
                    {t("happeningNow")} ({happening.length})
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {happening.map((event) => (
                      <EventCard key={event.id} event={event} counts={counts[event.id]} />
                    ))}
                  </div>
                </section>
              )}

              {/* Upcoming */}
              {upcoming.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-4">
                    {t("upcoming")} ({upcoming.length})
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {upcoming.map((event) => (
                      <EventCard key={event.id} event={event} counts={counts[event.id]} />
                    ))}
                  </div>
                </section>
              )}

              {/* Past */}
              {past.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-4 text-muted-foreground">
                    {t("past")} ({past.length})
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {past.map((event) => (
                      <EventCard key={event.id} event={event} counts={counts[event.id]} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">{t("noResultsHint")}</p>
              <Link href="/">
                <span className="text-primary hover:underline">{t("browseAll")}</span>
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ISR: Revalidate search pages periodically
export const revalidate = 3600; // 1 hour
