import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { DynamicEventMap } from "@/components/map/dynamic-event-map";
import type { Event, VenueMapMarker } from "@/lib/types";
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

interface MapData {
  events: Event[];
  happeningEventIds: string[];
  venues: VenueMapMarker[];
}

async function getMapData(): Promise<MapData> {
  const supabase = await createClient();

  // Fetch upcoming events with location data
  const { data: events, error } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "upcoming",
    p_limit: 100,
  });

  if (error) {
    console.error("Error fetching events for map:", error);
    return { events: [], happeningEventIds: [], venues: [] };
  }

  // Also get happening events (currently live)
  const { data: happeningEvents } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "happening",
    p_limit: 50,
  });

  // Track which events are currently happening for pulsing markers
  const happeningEventIds = (happeningEvents || []).map((e: Event) => e.id);

  const allEvents = [
    ...(events || []),
    ...(happeningEvents || []),
  ] as Event[];

  // Fetch venues for map display
  const { data: venues, error: venuesError } = await supabase.rpc("get_venues_for_map", {
    p_types: null,
    p_limit: 200,
  });

  if (venuesError) {
    console.error("Error fetching venues for map:", venuesError);
  }

  return {
    events: allEvents,
    happeningEventIds,
    venues: (venues || []) as VenueMapMarker[],
  };
}

function MapLoading() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

async function MapContent() {
  const { events, happeningEventIds, venues } = await getMapData();
  return <DynamicEventMap events={events} happeningEventIds={happeningEventIds} venues={venues} />;
}

export default async function MapPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="h-[calc(100dvh-3.5rem)] flex flex-col">
      {/* Map fills remaining space (accounting for sticky header height) */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<MapLoading />}>
          <MapContent />
        </Suspense>
      </div>
    </main>
  );
}
