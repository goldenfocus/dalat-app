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
import { EventGrid } from "@/components/events/event-grid";
import { EventFeedTabs, type EventLifecycle } from "@/components/events/event-feed-tabs";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { EventViewToggle } from "@/components/events/event-view-toggle";
import { Button } from "@/components/ui/button";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { ContentLocale } from "@/lib/types";
import type { Locale } from "@/lib/i18n/routing";
import { getEventTranslationsBatch } from "@/lib/translations";
import {
  getCachedEventsByLifecycle,
  getCachedEventCountsBatch,
  getCachedLifecycleCounts,
  getCachedHomepageConfig,
} from "@/lib/cache/server-cache";
import { HeroImageSection } from "@/components/home/hero-image-section";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ tab?: string }>;
};

/**
 * Generate metadata with LCP image preload for faster PageSpeed scores.
 * Preloads hero image if configured, otherwise preloads first event image.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Check for hero image first (takes priority as LCP element)
  const homepageConfig = await getCachedHomepageConfig();

  if (homepageConfig?.hero_image_url) {
    // Preload hero image at full width for desktop
    const preloadUrl = optimizedImageUrl(homepageConfig.hero_image_url, {
      width: 1920,
      quality: 80,
      format: "auto",
    });

    if (preloadUrl) {
      return {
        other: {
          link: `<${preloadUrl}>; rel=preload; as=image; fetchpriority=high`,
        },
      };
    }
  }

  // Fallback: preload first event image
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
      link: `<${preloadUrl}>; rel=preload; as=image; fetchpriority=high`,
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
  // Fetch 12 events for compact grid (4 rows × 3 columns on mobile)
  const events = await getCachedEventsByLifecycle(lifecycle, 12);

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
        <span className="text-3xl mb-3 block">🌿</span>
        <p className="mb-1 text-sm">{emptyMessage}</p>
        <p className="text-xs text-muted-foreground/70 mb-4">{t("emptyHint")}</p>
        {lifecycle === "upcoming" && (
          <Link href="/events/new" prefetch={false}>
            <Button size="sm">{t("createFirst")}</Button>
          </Link>
        )}
      </div>
    );
  }

  // Build series rrules map for EventGrid
  const seriesRrules: Record<string, string> = {};
  events.forEach((event) => {
    if (event.series_rrule) {
      seriesRrules[event.id] = event.series_rrule;
    }
  });

  return (
    <div className="space-y-4">
      {/* Event grid - adapts to user's view preference */}
      <EventGrid
        events={events}
        counts={counts}
        eventTranslations={eventTranslations}
        seriesRrules={seriesRrules}
      />

      {/* Show "See all" link */}
      {events.length >= 12 && (
        <div className="text-center py-2">
          <Link
            href={lifecycle === "past" ? "/events/this-month" : "/events/upcoming"}
            className="text-sm text-foreground/70 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            {lifecycle === "past" ? t("browseArchive") : t("seeAllUpcoming")} →
          </Link>
        </div>
      )}
    </div>
  );
}

export default async function Home({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { tab } = await searchParams;

  const [t, lifecycleCounts, homepageConfig] = await Promise.all([
    getTranslations("home"),
    getCachedLifecycleCounts(),
    getCachedHomepageConfig(),
  ]);

  // Read tab from URL, default to "happening" if events are live, otherwise "upcoming"
  const validTabs: EventLifecycle[] = ["upcoming", "happening", "past"];
  const defaultTab: EventLifecycle = lifecycleCounts.happening > 0 ? "happening" : "upcoming";
  const activeTab: EventLifecycle = validTabs.includes(tab as EventLifecycle)
    ? (tab as EventLifecycle)
    : defaultTab;

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
      {/* Conditionally render image hero or minimal text hero */}
      {homepageConfig?.hero_image_url ? (
        <HeroImageSection
          imageUrl={homepageConfig.hero_image_url}
          focalPoint={homepageConfig.hero_focal_point}
        />
      ) : (
        <HeroSection />
      )}

      {/* Main content */}
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-3 lg:py-6">
        {/* Tabs + View Toggle + Search */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-3">
          <Suspense fallback={<div className="h-10 w-48 bg-muted animate-pulse rounded-lg" />}>
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
          <div className="flex items-center gap-2">
            <EventViewToggle />
            <Suspense fallback={null}>
              <EventSearchBar className="hidden lg:flex w-64 flex-shrink-0" />
            </Suspense>
          </div>
        </div>

        {/* Compact event grid - 12 cards (3 cols × 4 rows on mobile) */}
        <Suspense
          fallback={
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/2] bg-muted animate-pulse rounded-lg"
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