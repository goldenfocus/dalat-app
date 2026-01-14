import { ArrowLeft, Calendar } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { locales, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { MonthNavigation } from "@/components/events/month-navigation";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { getMonthSlug, getAdjacentMonths } from "@/lib/events/archive-utils";
import type { Event, EventCounts } from "@/lib/types";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "archive" });

  return generateLocalizedMetadata({
    locale,
    path: "/events/this-month",
    title: t("thisMonth"),
    description: t("thisMonthDescription"),
    keywords: ["events", "this month", "Da Lat", "current"],
  });
}

async function getEventsThisMonth() {
  const supabase = await createClient();
  const { data: events, error } = await supabase.rpc("get_events_this_month", {
    p_limit: 50,
  });

  if (error) {
    console.error("Error fetching events this month:", error);
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

export default async function ThisMonthPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("archive");

  // Get current month info for navigation
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthSlug = getMonthSlug(currentMonth);
  const monthName = t(`months.${monthSlug}`);
  const adjacent = getAdjacentMonths(currentYear, currentMonth);

  const events = await getEventsThisMonth();
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("thisMonth"), url: "/events/this-month" },
    ],
    locale
  );

  // ItemList structured data
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("thisMonth"),
    description: t("thisMonthDescription"),
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://dalat.app/${locale}/events/${event.slug}`,
      name: event.title,
    })),
  };

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
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("thisMonth")}</h1>
            </div>
            <p className="text-muted-foreground">
              {events.length === 0
                ? t("noEventsThisMonth")
                : t("eventCount", { count: events.length })}
            </p>
          </div>

          {/* Month navigation - top */}
          <div className="mb-6">
            <MonthNavigation
              currentYear={currentYear}
              currentMonth={currentMonth}
              prev={adjacent.prev}
              next={adjacent.next}
              monthLabel={`${monthName} ${currentYear}`}
              prevLabel={t("previousMonth")}
              nextLabel={t("nextMonth")}
            />
          </div>

          {/* Link to this week */}
          <div className="mb-6">
            <Link
              href="/events/this-week"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              {t("viewThisWeek")}
            </Link>
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
              <p className="mb-4">{t("noEventsThisMonth")}</p>
              <Link href="/">
                <span className="text-primary hover:underline">{t("browseAllEvents")}</span>
              </Link>
            </div>
          )}

          {/* Month navigation - bottom */}
          {events.length > 4 && (
            <div className="mt-8">
              <MonthNavigation
                currentYear={currentYear}
                currentMonth={currentMonth}
                prev={adjacent.prev}
                next={adjacent.next}
                monthLabel={`${monthName} ${currentYear}`}
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

// ISR: Revalidate every hour
export const revalidate = 3600;
