import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocales, type Locale } from "@/lib/i18n/routing";
import { createStaticClient } from "@/lib/supabase/server";
import { MonthNavigation } from "@/components/events/month-navigation";
import { ArchiveEventsList } from "@/components/events/archive-events-list";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import {
  parseArchiveParams,
  getAdjacentMonths,
  getMonthSlug,
  isPastMonth,
} from "@/lib/events/archive-utils";
import {
  getCardCoverUrl,
  pickMomentCover,
  type CoverCandidateMoment,
  type EventSocial,
} from "@/lib/events/social-proof";
import type { Event, EventCounts } from "@/lib/types";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ locale: Locale; year: string; month: string }>;
};

// Generate static pages for all past months with events
export async function generateStaticParams() {
  const supabase = createStaticClient();
  
  // If env vars are not available, skip static generation
  if (!supabase) return [];
  
  const { data: monthsWithEvents } = await supabase.rpc("get_months_with_events");

  if (!monthsWithEvents) return [];

  const params: { locale: string; year: string; month: string }[] = [];

  for (const locale of buildLocales) {
    for (const { year, month } of monthsWithEvents) {
      params.push({
        locale,
        year: year.toString(),
        month: getMonthSlug(month),
      });
    }
  }

  return params;
}

// ISR: Revalidate past months rarely (they don't change), current/future more often
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, year, month } = await params;
  const parsed = parseArchiveParams(year, month);

  if (!parsed) {
    return { title: "Not Found" };
  }

  const t = await getTranslations({ locale, namespace: "archive" });
  const monthName = t(`months.${month}`);
  const title = t("eventsIn", { month: monthName, year: parsed.year });
  const description = t("description", { month: monthName, year: parsed.year });

  return generateLocalizedMetadata({
    locale,
    path: `/events/${year}/${month}`,
    title,
    description,
    keywords: ["events", monthName, parsed.year.toString(), "Đà Lạt"],
  });
}

async function getEventsByMonth(year: number, month: number) {
  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[archive] createStaticClient returned null — NEXT_PUBLIC_SUPABASE_* env missing; rendering empty page");
    return [];
  }
  const { data: events, error } = await supabase.rpc("get_events_by_month", {
    p_year: year,
    p_month: month,
    p_limit: 50,
  });

  if (error) {
    console.error("Error fetching events by month:", error);
    return [];
  }

  return events as Event[];
}

async function getEventCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[archive] createStaticClient returned null — NEXT_PUBLIC_SUPABASE_* env missing; rendering empty counts");
    return {};
  }
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

async function getMomentsCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[archive] createStaticClient returned null — NEXT_PUBLIC_SUPABASE_* env missing; rendering empty counts");
    return {};
  }
  const { data, error } = await supabase.rpc("get_events_moments_counts", {
    p_event_ids: eventIds,
  });

  if (error) {
    console.error("Error fetching moments counts:", error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.event_id] = row.moments_count;
  }
  return counts;
}

// Past events often lost their cover (or never had one) but have a gallery of
// moments — borrow the best moment photo so the card doesn't show default art.
async function getMomentCoverSocials(events: Event[]) {
  const needy = events.filter((e) => !getCardCoverUrl(e.image_url, undefined));
  if (needy.length === 0) return {};

  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[archive] createStaticClient returned null — NEXT_PUBLIC_SUPABASE_* env missing; rendering without moment covers");
    return {};
  }

  const ids = needy.map((e) => e.id);
  const [momentsRes, coversRes] = await Promise.all([
    supabase
      .from("moments")
      .select("id, event_id, media_url, thumbnail_url, featured_priority, captured_at, created_at")
      .in("event_id", ids)
      .in("content_type", ["photo", "image"])
      .eq("status", "published"),
    supabase.from("events").select("id, cover_moment_id").in("id", ids),
  ]);

  if (momentsRes.error) {
    console.error("Error fetching moment covers:", momentsRes.error);
    return {};
  }
  if (coversRes.error) {
    // Degrade to auto-picked covers, but keep the cover_moment_id loss visible
    console.error("Error fetching cover_moment_ids:", coversRes.error);
  }

  const coverMomentIds = new Map<string, string | null>(
    (coversRes.data ?? []).map((r) => [r.id, r.cover_moment_id])
  );

  const byEvent = new Map<string, CoverCandidateMoment[]>();
  for (const m of momentsRes.data ?? []) {
    const list = byEvent.get(m.event_id) ?? [];
    list.push(m);
    byEvent.set(m.event_id, list);
  }

  const socials: Record<string, EventSocial> = {};
  for (const [eventId, candidates] of byEvent) {
    const url = pickMomentCover(candidates, coverMomentIds.get(eventId));
    if (url) {
      socials[eventId] = {
        event_id: eventId,
        fallback_image_url: url,
        fallback_photo_credit: null,
        last_occurrence_went: null,
        last_occurrence_photos: null,
      };
    }
  }
  return socials;
}

export default async function MonthlyArchivePage({ params }: PageProps) {
  const { locale, year, month } = await params;
  setRequestLocale(locale);

  const parsed = parseArchiveParams(year, month);
  if (!parsed) {
    notFound();
  }

  const t = await getTranslations("archive");
  const monthName = t(`months.${month}`);
  const adjacent = getAdjacentMonths(parsed.year, parsed.month);

  const events = await getEventsByMonth(parsed.year, parsed.month);
  const eventIds = events.map((e) => e.id);

  // Fetch counts in parallel for better performance
  const [counts, momentsCounts, socials] = await Promise.all([
    getEventCounts(eventIds),
    getMomentsCounts(eventIds),
    getMomentCoverSocials(events),
  ]);

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: `${monthName} ${parsed.year}`, url: `/events/${year}/${month}` },
    ],
    locale
  );

  // ItemList structured data for events
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("eventsIn", { month: monthName, year: parsed.year }),
    description: t("description", { month: monthName, year: parsed.year }),
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://dalat.app/${locale}/events/${event.slug}`,
      name: event.title,
    })),
  };

  // Dynamic revalidation based on whether month is past
  const _revalidate = isPastMonth(parsed.year, parsed.month) ? 86400 : 3600; // 24h vs 1h

  return (
    <>
      <JsonLd data={[breadcrumbSchema, itemListSchema]} />

      <main className="min-h-screen flex flex-col">
        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">
              {t("eventsIn", { month: monthName, year: parsed.year })}
            </h1>
            <p className="text-muted-foreground">
              {events.length === 0
                ? t("noEvents", { month: monthName, year: parsed.year })
                : t("eventCount", { count: events.length })}
            </p>
          </div>

          {/* Month navigation - top */}
          <div className="mb-6">
            <MonthNavigation
              currentYear={parsed.year}
              currentMonth={parsed.month}
              prev={adjacent.prev}
              next={adjacent.next}
              monthLabel={`${monthName} ${parsed.year}`}
              prevLabel={t("previousMonth")}
              nextLabel={t("nextMonth")}
            />
          </div>

          {/* Events list with filters */}
          {events.length > 0 ? (
            <ArchiveEventsList
              events={events}
              counts={counts}
              momentsCounts={momentsCounts}
              socials={socials}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">{t("noEvents", { month: monthName, year: parsed.year })}</p>
              <Link href="/">
                <span className="text-primary hover:underline">{t("browseAllEvents")}</span>
              </Link>
            </div>
          )}

          {/* Month navigation - bottom */}
          {events.length > 4 && (
            <div className="mt-8">
              <MonthNavigation
                currentYear={parsed.year}
                currentMonth={parsed.month}
                prev={adjacent.prev}
                next={adjacent.next}
                monthLabel={`${monthName} ${parsed.year}`}
                prevLabel={t("previousMonth")}
                nextLabel={t("nextMonth")}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// Export revalidation (will be overridden by dynamic check in component)
export const revalidate = 3600;
