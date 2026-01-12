import { Suspense } from "react";
import { Link } from "@/lib/i18n/routing";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { EventCard } from "@/components/events/event-card";
import { EventFeedImmersive } from "@/components/events/event-feed-immersive";
import { EventFeedTabs, type EventLifecycle } from "@/components/events/event-feed-tabs";
import { Button } from "@/components/ui/button";
import type { Event, EventCounts } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

function parseLifecycle(tab: string | undefined): EventLifecycle {
  if (tab === "happening" || tab === "past") return tab;
  return "upcoming";
}

async function getEventsByLifecycle(lifecycle: EventLifecycle) {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .rpc("get_events_by_lifecycle", {
      p_lifecycle: lifecycle,
      p_limit: 20,
    });

  if (error) {
    console.error("Error fetching events:", error);
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

async function getLifecycleCounts() {
  const supabase = await createClient();

  // Get count of happening events (just need to know if > 0)
  const { data: happeningEvents } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "happening",
    p_limit: 1,
  });

  return {
    upcoming: 0, // Not needed for hiding logic
    happening: happeningEvents?.length ?? 0,
    past: 0, // Not needed for hiding logic
  };
}

async function EventsFeed({ lifecycle }: { lifecycle: EventLifecycle }) {
  const events = await getEventsByLifecycle(lifecycle);
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);
  const t = await getTranslations("home");

  if (events.length === 0) {
    const emptyMessage =
      lifecycle === "happening"
        ? t("noHappening")
        : lifecycle === "past"
          ? t("noPast")
          : t("noUpcoming");

    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-4">{emptyMessage}</p>
        {lifecycle === "upcoming" && (
          <Link href="/events/new" prefetch={false}>
            <Button>{t("createFirst")}</Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((event) => (
        <EventCard key={event.id} event={event} counts={counts[event.id]} />
      ))}
    </div>
  );
}

function DesktopTabs({
  activeTab,
  lifecycleCounts,
  labels
}: {
  activeTab: EventLifecycle;
  lifecycleCounts: { upcoming: number; happening: number; past: number };
  labels: { upcoming: string; happening: string; past: string };
}) {
  return (
    <Suspense fallback={<div className="h-10 bg-muted rounded-lg animate-pulse" />}>
      <EventFeedTabs
        activeTab={activeTab}
        useUrlNavigation
        counts={lifecycleCounts}
        hideEmptyTabs
        labels={labels}
      />
    </Suspense>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = parseLifecycle(params.tab);
  const [t, tNav, lifecycleCounts] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getLifecycleCounts(),
  ]);

  return (
    <>
      {/* Mobile: Full immersive experience */}
      <div className="lg:hidden h-[100dvh] relative">
        {/* Floating mini-header */}
        <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 via-black/40 to-transparent">
          <Link href="/" className="font-bold text-white text-sm drop-shadow-lg">
            dalat.app
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/events/new" prefetch={false}>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 hover:text-white drop-shadow-lg"
              >
                <Plus className="w-4 h-4 mr-1" />
                {tNav("events")}
              </Button>
            </Link>
            <Suspense>
              <AuthButton />
            </Suspense>
          </div>
        </nav>

        <Suspense
          fallback={
            <div className="h-[100dvh] flex items-center justify-center bg-black">
              <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          }
        >
          <EventFeedImmersive lifecycle={activeTab} lifecycleCounts={lifecycleCounts} />
        </Suspense>
      </div>

      {/* Desktop: Traditional layout with header/footer */}
      <main className="hidden lg:flex min-h-screen flex-col">
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
                  {tNav("events")}
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
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <DesktopTabs
              activeTab={activeTab}
              lifecycleCounts={lifecycleCounts}
              labels={{
                upcoming: t("tabs.upcoming"),
                happening: t("tabs.happening"),
                past: t("tabs.past"),
              }}
            />
          </div>

          <Suspense
            fallback={
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-80 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
            }
          >
            <EventsFeed lifecycle={activeTab} />
          </Suspense>
        </div>

        {/* Footer */}
        <footer className="border-t py-6">
          <div className="container max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
            <p>{t("footer")}</p>
          </div>
        </footer>
      </main>
    </>
  );
}
