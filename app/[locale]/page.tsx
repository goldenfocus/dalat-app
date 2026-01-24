import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/lib/i18n/routing";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;

// ISR: Cache homepage for 5 minutes for better PageSpeed scores
// Longer cache = fewer cache misses = faster TTFB
export const revalidate = 300;

import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { MobileHeader } from "@/components/home/mobile-header";
import { HeroSection } from "@/components/home/hero-section";
import { EventCard } from "@/components/events/event-card";
import { EventCardStatic } from "@/components/events/event-card-static";
import { EventFeedTabs, type EventLifecycle } from "@/components/events/event-feed-tabs";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { Button } from "@/components/ui/button";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { EventWithSeriesData, ContentLocale } from "@/lib/types";
import type { Locale } from "@/lib/i18n/routing";
import { getEventTranslationsBatch } from "@/lib/translations";
import {
  getCachedEventsByLifecycle,
  getCachedEventCountsBatch,
  getCachedLifecycleCounts,
} from "@/lib/cache/server-cache";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

/**
 * Generate metadata with LCP image preload for faster PageSpeed scores.
 * Preloading the first event's image can reduce LCP by ~300-500ms.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Get first event to preload its image (reuses ISR cache)
  const events = await getCachedEventsByLifecycle("upcoming", 1);
  const firstEvent = events[0];

  if (!firstEvent?.image_url) {
    return {};
  }

  // Build preload URL using Cloudflare CDN
  // 200px matches actual mobile render size (~45vw on 390px screen = ~175px)
  const preloadUrl = optimizedImageUrl(firstEvent.image_url, {
    width: 200,
    quality: 70,
    format: "auto",
  });

  if (!preloadUrl) {
    return {};
  }

  return {
    other: {
      // Preload hint for the LCP image
      "link": `<${preloadUrl}>; rel=preload; as=image; fetchpriority=high`,
    },
  };
}

async function EventsFeed({
  lifecycle,
  locale,
}: {
  lifecycle: EventLifecycle;
  locale: Locale;
}) {
  // Use cached functions for fast LCP
  const events = await getCachedEventsByLifecycle(lifecycle);

  const eventIds = events.map((e) => e.id);
  const [counts, eventTranslations, t, tEvents] = await Promise.all([
    getCachedEventCountsBatch(eventIds),
    getEventTranslationsBatch(eventIds, locale as ContentLocale),
    getTranslations("home"),
    getTranslations("events"),
  ]);

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

  // Labels for server-rendered card (avoiding hook in server component)
  const eventLabels = {
    going: tEvents("going"),
    went: tEvents("went"),
    full: tEvents("full"),
    interested: tEvents("interested"),
    waitlist: tEvents("waitlist"),
  };

  return (
    <div className="space-y-6">
      {/* 2-column grid on mobile, 3-column on desktop for better discoverability */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        {events.map((event, index) => {
          const translation = eventTranslations.get(event.id);
          // Use server-rendered card for first event (LCP optimization)
          // This eliminates hydration delay for the LCP image
          if (index === 0) {
            return (
              <EventCardStatic
                key={event.id}
                event={event}
                counts={counts[event.id]}
                seriesRrule={event.series_rrule ?? undefined}
                translatedTitle={translation?.title || undefined}
                locale={locale}
                labels={eventLabels}
              />
            );
          }
          return (
            <EventCard
              key={event.id}
              event={event}
              counts={counts[event.id]}
              seriesRrule={event.series_rrule ?? undefined}
              translatedTitle={translation?.title || undefined}
            />
          );
        })}
      </div>

      {/* Show "See all" link when viewing upcoming events with 20+ events */}
      {lifecycle === "upcoming" && events.length >= 20 && (
        <div className="text-center py-4">
          <Link
            href="/events/upcoming"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("seeAllUpcoming")} →
          </Link>
        </div>
      )}

      {/* Show archive link when viewing past events */}
      {lifecycle === "past" && (
        <div className="text-center py-4">
          <Link
            href="/events/this-month"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("browseArchive")} →
          </Link>
        </div>
      )}
    </div>
  );
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  // Always render "upcoming" tab server-side for ISR caching
  // Tab switching is handled client-side via URL navigation
  const activeTab: EventLifecycle = "upcoming";

  const [t, lifecycleCounts] = await Promise.all([
    getTranslations("home"),
    getCachedLifecycleCounts(),
  ]);

  return (
    <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
      {/* Mobile header - scroll-aware, shows auth state */}
      <div className="lg:hidden">
        <MobileHeader />
      </div>

      {/* Desktop header */}
      <div className="hidden lg:block">
        <SiteHeader />
      </div>

      {/* Hero Section - server-rendered for fast LCP */}
      <HeroSection />

      {/* Main content */}
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Tabs + Search */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <Suspense fallback={<div className="h-10 w-64 bg-muted animate-pulse rounded-lg" />}>
            <EventFeedTabs
              activeTab={activeTab}
              useUrlNavigation
              counts={lifecycleCounts}
              hideEmptyTabs
              labels={{
                upcoming: t("tabs.upcoming"),
                happening: t("tabs.happening"),
                past: t("tabs.past"),
              }}
            />
          </Suspense>
          <Suspense fallback={null}>
            <EventSearchBar className="hidden lg:flex w-64 flex-shrink-0" />
          </Suspense>
        </div>

        {/* Event grid */}
        <Suspense
          fallback={
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-64 sm:h-80 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          }
        >
          <EventsFeed lifecycle={activeTab} locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}