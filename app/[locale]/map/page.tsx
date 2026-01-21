import { Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventMap } from "@/components/map/event-map";
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
    path: "/map",
    title: "Event Map",
    description: "Discover events happening around Da Lat on an interactive map",
    keywords: ["events", "map", "Da Lat", "locations"],
  });
}

async function getUpcomingEvents(): Promise<Event[]> {
  const supabase = await createClient();

  // Fetch upcoming events with location data
  const { data: events, error } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "upcoming",
    p_limit: 100,
  });

  if (error) {
    console.error("Error fetching events for map:", error);
    return [];
  }

  // Also get happening events
  const { data: happeningEvents } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "happening",
    p_limit: 50,
  });

  return [
    ...(events || []),
    ...(happeningEvents || []),
  ] as Event[];
}

function MapLoading() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

async function MapContent() {
  const events = await getUpcomingEvents();
  return <EventMap events={events} />;
}

export default async function MapPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="h-[100dvh] flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-5xl items-center mx-auto px-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Event Map</span>
          </Link>
        </div>
      </nav>

      {/* Map fills remaining space */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<MapLoading />}>
          <MapContent />
        </Suspense>
      </div>
    </main>
  );
}
