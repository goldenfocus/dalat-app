import { Suspense } from "react";
import { Link } from "@/lib/i18n/routing";
import { Plus, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { LocalePicker } from "@/components/locale-picker";
import { EventCard } from "@/components/events/event-card";
import { EventFeedImmersive } from "@/components/events/event-feed-immersive";
import { EventFeedTabs, type EventLifecycle } from "@/components/events/event-feed-tabs";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { PastContentFeed } from "@/components/feed";
import { Button } from "@/components/ui/button";
import type { Event, EventCounts } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ tab?: string; q?: string }>;
};

function parseLifecycle(tab: string | undefined): EventLifecycle {
  if (tab === "happening" || tab === "past") return tab;
  return "upcoming";
}

async function getEventsByLifecycle(lifecycle: EventLifecycle, searchQuery?: string) {
  const supabase = await createClient();

  // Use search RPC if there's a query, otherwise use lifecycle RPC
  if (searchQuery && searchQuery.trim()) {
    const { data: events, error } = await supabase
      .rpc("search_events", {
        p_query: searchQuery.trim(),
        p_lifecycle: lifecycle,
        p_limit: 20,
      });

    if (error) {
      console.error("Error searching events:", error);
      return [];
    }

    return events as Event[];
  }

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

async function EventsFeed({
  lifecycle,
  searchQuery,
}: {
  lifecycle: EventLifecycle;
  searchQuery?: string;
}) {
  const events = await getEventsByLifecycle(lifecycle, searchQuery);
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);
  const t = await getTranslations("home");

  if (events.length === 0) {
    // Different message for search vs no results
    const emptyMessage = searchQuery
      ? t("search.noResults", { query: searchQuery })
      : lifecycle === "happening"
        ? t("noHappening")
        : lifecycle === "past"
          ? t("noPast")
          : t("noUpcoming");

    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-4">{emptyMessage}</p>
        {lifecycle === "upcoming" && !searchQuery && (
          <Link href="/events/new" prefetch={false}>
            <Button>{t("createFirst")}</Button>
          </Link>
        )}
        {searchQuery && (
          <Link href="/">
            <Button variant="outline">{t("search.clearSearch")}</Button>
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
  const searchQuery = params.q ?? "";
  const [t, tNav, tArchive, lifecycleCounts] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getTranslations("archive"),
    getLifecycleCounts(),
  ]);

  return (
    <>
      {/* Mobile: Full immersive experience */}
      <div className="lg:hidden h-[100dvh] relative">
        {/* Floating mini-header */}
        <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 via-black/40 to-transparent">
          <div className="flex items-center gap-1">
            <Link href="/" className="font-bold text-white text-sm drop-shadow-lg">
              dalat.app
            </Link>
            <LocalePicker variant="overlay" />
          </div>
          <div className="flex items-center gap-1">
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
        <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
            <div className="flex items-center gap-2">
              <Link href="/" className="font-bold text-lg">
                dalat.app
              </Link>
              <LocalePicker />
            </div>
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
                <p className="text-muted-foreground">{t("subtitle")}</p>
              </div>
              <Suspense fallback={null}>
                <EventSearchBar className="w-64 flex-shrink-0" />
              </Suspense>
            </div>
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

          {/* Content carousel for Past tab */}
          {activeTab === "past" && (
            <Suspense fallback={null}>
              <PastContentFeed />
            </Suspense>
          )}

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
            <EventsFeed lifecycle={activeTab} searchQuery={searchQuery} />
          </Suspense>

          {/* Archive link for past events */}
          {activeTab === "past" && (
            <div className="mt-8 text-center">
              <Link href="/events/this-month" className="text-sm text-muted-foreground hover:text-foreground">
                {tArchive("browseArchive")} →
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
