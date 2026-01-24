import { Suspense } from "react";
import { Link } from "@/lib/i18n/routing";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;

// ISR: Cache homepage for 5 minutes for better PageSpeed scores
// Longer cache = fewer cache misses = faster TTFB
export const revalidate = 300;

import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { HeroSection } from "@/components/home/hero-section";
import { EventCard } from "@/components/events/event-card";
import { EventFeedTabs, type EventLifecycle } from "@/components/events/event-feed-tabs";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { Button } from "@/components/ui/button";
import type { Event, EventCounts, EventWithSeriesData, ContentLocale } from "@/lib/types";
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
  const [counts, eventTranslations, t] = await Promise.all([
    getCachedEventCountsBatch(eventIds),
    getEventTranslationsBatch(eventIds, locale as ContentLocale),
    getTranslations("home"),
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

  return (
    <div className="space-y-6">
      {/* 2-column grid on mobile for better discoverability */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {events.map((event, index) => {
          const translation = eventTranslations.get(event.id);
          return (
            <EventCard
              key={event.id}
              event={event}
              counts={counts[event.id]}
              seriesRrule={event.series_rrule ?? undefined}
              translatedTitle={translation?.title || undefined}
              priority={index === 0}
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
      {/* Desktop header */}
      <div className="hidden lg:block">
        <SiteHeader />
      </div>

      {/* Hero Section - server-rendered for fast LCP */}
      <HeroSection />

      {/* Main content */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-4">
        {/* Tabs + Search */}
        <div className="flex items-center justify-between gap-4 mb-4">
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
          <Suspense fallback={null}>
            <EventSearchBar className="hidden lg:flex w-64 flex-shrink-0" />
          </Suspense>
        </div>

        {/* Event grid */}
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
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
