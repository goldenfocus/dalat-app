import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { locales, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventGrid } from "@/components/events/event-grid";
import { EventViewToggle } from "@/components/events/event-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { getEventTranslationsBatch } from "@/lib/translations";
import type { Event, EventCounts, ContentLocale } from "@/lib/types";
import type { Metadata } from "next";

// ISR: Revalidate every 60 seconds (same as main page)
export const revalidate = 60;

// Increase serverless function timeout
export const maxDuration = 60;

const EVENTS_PER_PAGE = 24;

type PageProps = {
  params: Promise<{ locale: Locale; page?: string[] }>;
};

function getPageNumber(pageParam: string[] | undefined): number {
  if (!pageParam || pageParam.length === 0) return 1;
  const num = parseInt(pageParam[0], 10);
  return isNaN(num) || num < 1 ? 1 : num;
}

// Pre-generate first 3 pages for each locale
export async function generateStaticParams() {
  const params: { locale: string; page: string[] | undefined }[] = [];

  for (const locale of locales) {
    // Page 1 (no page param)
    params.push({ locale, page: undefined });
    // Pages 2-3
    params.push({ locale, page: ["2"] });
    params.push({ locale, page: ["3"] });
  }

  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, page: pageParam } = await params;
  const page = getPageNumber(pageParam);
  const t = await getTranslations({ locale, namespace: "upcomingEvents" });

  const title = page === 1 ? t("title") : t("titlePage", { page });
  const description = t("description");

  return generateLocalizedMetadata({
    locale,
    path: page === 1 ? "/events/upcoming" : `/events/upcoming/${page}`,
    title,
    description,
    keywords: ["events", "upcoming", "Da Lat", "things to do"],
  });
}

async function getUpcomingEvents(limit: number, offset: number) {
  const supabase = await createClient();

  // Try the new paginated RPC first, fallback to basic query
  const { data, error } = await supabase.rpc("get_upcoming_events_paginated", {
    p_limit: limit,
    p_offset: offset,
  });

  // Fallback if RPC doesn't exist yet
  if (error?.code === "PGRST202") {
    const { data: fallbackData } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .range(offset, offset + limit - 1);

    return (fallbackData as Event[]) || [];
  }

  if (error) {
    console.error("Error fetching upcoming events:", error);
    return [];
  }

  return (data as Event[]) || [];
}

async function getUpcomingEventsCount() {
  const supabase = await createClient();

  // Try the new count RPC first
  const { data, error } = await supabase.rpc("get_upcoming_events_count");

  // Fallback if RPC doesn't exist yet
  if (error?.code === "PGRST202") {
    const { count } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .gt("starts_at", new Date().toISOString());

    return count || 0;
  }

  if (error) {
    console.error("Error fetching event count:", error);
    return 0;
  }

  return data || 0;
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

export default async function UpcomingEventsPage({ params }: PageProps) {
  const { locale, page: pageParam } = await params;
  setRequestLocale(locale);

  const page = getPageNumber(pageParam);
  const offset = (page - 1) * EVENTS_PER_PAGE;

  // Fetch events and count in parallel
  const [events, totalCount, t] = await Promise.all([
    getUpcomingEvents(EVENTS_PER_PAGE, offset),
    getUpcomingEventsCount(),
    getTranslations("upcomingEvents"),
  ]);

  const totalPages = Math.ceil(totalCount / EVENTS_PER_PAGE);

  // 404 if page is out of range (but allow page 1 even if empty)
  if (page > 1 && page > totalPages) {
    notFound();
  }

  const eventIds = events.map((e) => e.id);
  const [counts, eventTranslations] = await Promise.all([
    getEventCounts(eventIds),
    getEventTranslationsBatch(eventIds, locale as ContentLocale),
  ]);

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("breadcrumb"), url: "/events/upcoming" },
      ...(page > 1 ? [{ name: `Page ${page}`, url: `/events/upcoming/${page}` }] : []),
    ],
    locale
  );

  // ItemList structured data
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("title"),
    description: t("description"),
    numberOfItems: totalCount,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      url: `https://dalat.app/${locale}/events/${event.slug}`,
      name: event.title,
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, itemListSchema]} />

      {/* SEO: prev/next links for pagination */}
      {page > 1 && (
        <link
          rel="prev"
          href={`https://dalat.app/${locale}/events/upcoming${page === 2 ? "" : `/${page - 1}`}`}
        />
      )}
      {page < totalPages && (
        <link rel="next" href={`https://dalat.app/${locale}/events/upcoming/${page + 1}`} />
      )}

      <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
        {/* Content */}
        <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
          {/* Page title + View toggle */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {page === 1 ? t("title") : t("titlePage", { page })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {totalCount === 0
                  ? t("noEvents")
                  : t("eventCount", { count: totalCount })}
              </p>
            </div>
            <EventViewToggle />
          </div>

          {/* Top pagination for pages > 1 */}
          {page > 1 && totalPages > 1 && (
            <div className="mb-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                baseUrl="/events/upcoming"
              />
            </div>
          )}

          {/* Events grid */}
          {events.length > 0 ? (
            <EventGrid
              events={events}
              counts={counts}
              eventTranslations={eventTranslations}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">{t("noEvents")}</p>
              <Link href="/events/new">
                <span className="text-primary hover:underline">{t("createEvent")}</span>
              </Link>
            </div>
          )}

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="mt-8">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                baseUrl="/events/upcoming"
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
