import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCalendar } from "@/components/calendar/event-calendar";
import type { Event } from "@/lib/types";
import type { Metadata } from "next";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";

const SITE_URL = "https://dalat.app";

export const maxDuration = 60;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return generateLocalizedMetadata({
    locale,
    path: "/calendar",
    title: "Event Calendar",
    description: "Browse upcoming events in Da Lat by date",
    keywords: ["events", "calendar", "Da Lat", "schedule"],
  });
}

async function getEvents(): Promise<Event[]> {
  const supabase = await createClient();

  // Fetch upcoming and happening events for the calendar
  const { data: upcomingEvents, error: upcomingError } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "upcoming",
    p_limit: 200,
  });

  if (upcomingError) {
    console.error("Error fetching upcoming events:", upcomingError);
  }

  const { data: happeningEvents } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "happening",
    p_limit: 50,
  });

  return [
    ...(upcomingEvents || []),
    ...(happeningEvents || []),
  ] as Event[];
}

function CalendarLoading() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

async function CalendarContent({ locale }: { locale: Locale }) {
  const events = await getEvents();

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Event Calendar", url: "/calendar" },
    ],
    locale
  );

  const calendarSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Event Calendar - Da Lat",
    description:
      "Upcoming events in Da Lat, Vietnam organized by date",
    numberOfItems: events.length,
    itemListElement: events.slice(0, 50).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/events/${event.slug}`,
      name: event.title,
      item: {
        "@type": "Event",
        name: event.title,
        startDate: event.starts_at,
        ...(event.ends_at && { endDate: event.ends_at }),
      },
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, calendarSchema]} />
      <EventCalendar events={events} />
    </>
  );
}

export default async function CalendarPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="h-[calc(100dvh-3.5rem)] flex flex-col">
      {/* Calendar fills remaining space (accounting for sticky header height) */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<CalendarLoading />}>
          <CalendarContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
