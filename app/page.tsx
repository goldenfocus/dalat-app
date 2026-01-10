import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { EventCard } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import type { Event, EventCounts } from "@/lib/types";

async function getEvents() {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }

  return events as Event[];
}

async function getEventCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = await createClient();

  // Single query to get all RSVPs for all events
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("event_id, status, plus_ones")
    .in("event_id", eventIds);

  // Compute counts in JS (much faster than N RPC calls)
  const counts: Record<string, EventCounts> = {};

  for (const eventId of eventIds) {
    const eventRsvps = rsvps?.filter(r => r.event_id === eventId) || [];
    const goingRsvps = eventRsvps.filter(r => r.status === "going");
    const waitlistRsvps = eventRsvps.filter(r => r.status === "waitlist");

    counts[eventId] = {
      event_id: eventId,
      going_count: goingRsvps.length,
      waitlist_count: waitlistRsvps.length,
      going_spots: goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0),
    };
  }

  return counts;
}

async function EventsFeed() {
  const events = await getEvents();
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-4">No upcoming events yet.</p>
        <Link href="/events/new" prefetch={false}>
          <Button>Create the first event</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} counts={counts[event.id]} />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <Link href="/" className="font-bold text-lg">
            dalat.app
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/events/new" prefetch={false}>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" />
                Event
              </Button>
            </Link>
            <Suspense>
              <AuthButton />
            </Suspense>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Upcoming Events</h1>
          <p className="text-muted-foreground">
            Discover what&apos;s happening in Da Lat
          </p>
        </div>

        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-48 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          }
        >
          <EventsFeed />
        </Suspense>
      </div>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Made with ❤️ for Đà Lạt</p>
        </div>
      </footer>
    </main>
  );
}
