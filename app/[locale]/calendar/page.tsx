import { Suspense } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCalendar } from "@/components/calendar/event-calendar";
import { AuthButton } from "@/components/auth-button";
import { getEffectiveUser } from "@/lib/god-mode";
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

  const { user } = await getEffectiveUser();
  const isAuthenticated = !!user;

  return (
    <main className="h-[100dvh] flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-5xl items-center justify-between mx-auto px-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Event Calendar</span>
          </Link>
          <div className="flex items-center gap-1">
            {isAuthenticated && (
              <Link
                href="/events/new"
                prefetch={false}
                className="flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
                aria-label="Create event"
              >
                <Plus className="w-5 h-5" />
              </Link>
            )}
            <Suspense>
              <AuthButton />
            </Suspense>
          </div>
        </div>
      </nav>

      {/* Calendar fills remaining space */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<CalendarLoading />}>
          <CalendarContent />
        </Suspense>
      </div>
    </main>
  );
}
