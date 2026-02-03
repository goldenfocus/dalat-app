import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCalendar } from "@/components/calendar/event-calendar";
import type { Event } from "@/lib/types";
import type { Metadata } from "next";
import { generateLocalizedMetadata } from "@/lib/metadata";

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

async function CalendarContent() {
  const events = await getEvents();
  return <EventCalendar events={events} />;
}

export default async function CalendarPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="h-[calc(100dvh-3.5rem)] flex flex-col">
      {/* Calendar fills remaining space (accounting for sticky header height) */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<CalendarLoading />}>
          <CalendarContent />
        </Suspense>
      </div>
    </main>
  );
}
