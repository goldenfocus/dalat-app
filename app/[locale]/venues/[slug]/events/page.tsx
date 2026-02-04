import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Calendar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import type { Event, EventCounts, Venue } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Venue;
}

async function getPastEvents(venueId: string): Promise<Event[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching past events:", error);
    return [];
  }

  return (data || []) as Event[];
}

async function getEventCounts(eventIds: string[]): Promise<Record<string, EventCounts>> {
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const venue = await getVenueBySlug(slug);

  if (!venue) {
    return { title: "Not Found" };
  }

  const t = await getTranslations({ locale, namespace: "venues" });
  const title = t("pastEventsAtVenue", { venue: venue.name });

  return {
    title,
    description: `${title} - Đà Lạt`,
  };
}

export default async function VenuePastEventsPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations("venues");

  const venue = await getVenueBySlug(slug);

  if (!venue) {
    notFound();
  }

  const events = await getPastEvents(venue.id);
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("title"), url: "/venues" },
      { name: venue.name, url: `/venues/${venue.slug}` },
      { name: t("pastEvents"), url: `/venues/${venue.slug}/events` },
    ],
    locale
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema]} />

      <main className="min-h-screen flex flex-col">
        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">
              {t("pastEventsAtVenue", { venue: venue.name })}
            </h1>
            <p className="text-muted-foreground">
              {events.length} {t("pastEvents").toLowerCase()}
            </p>
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
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("noPastEvents")}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
