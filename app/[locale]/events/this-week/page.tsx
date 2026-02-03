import { CalendarDays } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locales, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
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
    path: "/events/this-week",
    title: t("thisWeek"),
    description: t("thisWeekDescription"),
    keywords: ["events", "this week", "Đà Lạt", "weekend", "current"],
  });
}

async function getEventsThisWeek() {
  const supabase = await createClient();
  const { data: events, error } = await supabase.rpc("get_events_this_week", {
    p_limit: 50,
  });

  if (error) {
    console.error("Error fetching events this week:", error);
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

// Get week date range for display
function getWeekDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Adjust for Monday start (getDay returns 0 for Sunday)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export default async function ThisWeekPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("archive");

  const events = await getEventsThisWeek();
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  const { start, end } = getWeekDateRange();

  // Format date range for display
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const dateRange = `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("thisWeek"), url: "/events/this-week" },
    ],
    locale
  );

  // ItemList structured data
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("thisWeek"),
    description: t("thisWeekDescription"),
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
        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Page title */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">{t("thisWeek")}</h1>
            </div>
            <p className="text-muted-foreground mb-1">{dateRange}</p>
            <p className="text-muted-foreground text-sm">
              {events.length === 0
                ? t("noEventsThisWeek")
                : t("eventCount", { count: events.length })}
            </p>
          </div>

          {/* Link to this month */}
          <div className="mb-6">
            <Link
              href="/events/this-month"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              {t("viewThisMonth")}
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
              <p className="mb-4">{t("noEventsThisWeek")}</p>
              <div className="flex flex-col gap-2 items-center">
                <Link href="/events/this-month">
                  <span className="text-primary hover:underline">{t("viewThisMonth")}</span>
                </Link>
                <Link href="/">
                  <span className="text-primary hover:underline">{t("browseAllEvents")}</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ISR: Revalidate every hour
export const revalidate = 3600;
