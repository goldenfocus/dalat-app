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
      <div className="text-center py-16 text-muted-foreground">
        <span className="text-4xl mb-4 block">🌿</span>
        <p className="mb-2">{emptyMessage}</p>
        <p className="text-sm text-muted-foreground/70 mb-6">{t("emptyHint")}</p>
        {lifecycle === "upcoming" && (
          <Link href="/events/new" prefetch={false}>
            <Button>{t("createFirst")}</Button>
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
    <div className="space-y-6">
      {/* Event grid - adapts to user's view preferences */}
      <EventGrid
        events={events}
        counts={counts}
        eventTranslations={eventTranslations}
        seriesRrules={seriesRrules}
      />

      {/* Show "See all" link for upcoming events */}
      {lifecycle === "upcoming" && events.length > 0 && (
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

  const [t, lifecycleCounts, homepageConfig] = await Promise.all([
    getTranslations("home"),
    getCachedLifecycleCounts(),
    getCachedHomepageConfig(),
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
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Tabs + View Toggle + Search */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4">
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
          <div className="flex items-center gap-2">
            <EventViewToggle />
            <Suspense fallback={null}>
              <EventSearchBar className="hidden lg:flex w-64 flex-shrink-0" />
            </Suspense>
          </div>
        </div>

        {/* Event grid */}
        <Suspense
          fallback={
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="aspect-[4/5] bg-muted animate-pulse rounded-xl"
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