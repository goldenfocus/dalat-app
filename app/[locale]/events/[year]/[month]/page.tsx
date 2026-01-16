import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { locales, type Locale } from "@/lib/i18n/routing";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { MonthNavigation } from "@/components/events/month-navigation";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import {
  parseArchiveParams,
  getAdjacentMonths,
  getMonthSlug,
  getAllMonthSlugs,
  isPastMonth,
} from "@/lib/events/archive-utils";
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

  for (const locale of locales) {
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
    keywords: ["events", monthName, parsed.year.toString(), "Da Lat"],
  });
}

async function getEventsByMonth(year: number, month: number) {
  const supabase = await createClient();
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
  const counts = await getEventCounts(eventIds);

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("events"), url: "/events/this-month" },
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
  const revalidate = isPastMonth(parsed.year, parsed.month) ? 86400 : 3600; // 24h vs 1h

  return (
    <>
      <JsonLd data={[breadcrumbSchema, itemListSchema]} />

      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
            <Link
              href="/"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("backToHome")}</span>
            </Link>
          </div>
        </nav>

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

          {/* Events grid */}
          {events.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} counts={counts[event.id]} />
              ))}
            </div>
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
