import { Suspense } from "react";
import type { Metadata } from "next";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;

// ISR: Cache homepage for 5 minutes for better PageSpeed scores
// Longer cache = fewer cache misses = faster TTFB
export const revalidate = 300;

import { setRequestLocale } from "next-intl/server";
import { HeroSection } from "@/components/home/hero-section";
import { EventFeedScrollable, EventFeedScrollableSkeleton } from "@/components/events/event-feed-scrollable";
import { YourEventsSection } from "@/components/home/your-events-section";
import { EventSearchBar } from "@/components/events/event-search-bar";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { Locale } from "@/lib/i18n/routing";
import {
  getCachedEventsByLifecycle,
  getCachedLifecycleCounts,
  getCachedHomepageConfig,
} from "@/lib/cache/server-cache";
import { HeroImageSection } from "@/components/home/hero-image-section";
import { MomentsStripServer } from "@/components/home/moments-strip-server";

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

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  // Enable static rendering with correct locale for translations
  setRequestLocale(locale);

  const [lifecycleCounts, homepageConfig] = await Promise.all([
    getCachedLifecycleCounts(),
    getCachedHomepageConfig(),
  ]);

  return (
    <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
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

      {/* Recent Moments Strip - Instagram Stories style */}
      <Suspense fallback={null}>
        <MomentsStripServer />
      </Suspense>

      {/* Main content - Scrollable event feed */}
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Desktop search bar */}
        <div className="hidden lg:flex justify-end mb-4">
          <Suspense fallback={null}>
            <EventSearchBar className="w-72" />
          </Suspense>
        </div>

        {/* Your Events - personalized section for logged-in users */}
        <Suspense fallback={null}>
          <YourEventsSection locale={locale} />
        </Suspense>

        {/* Scrollable event feed with "Happening Now" and "Coming Up" sections */}
        <Suspense fallback={<EventFeedScrollableSkeleton />}>
          <EventFeedScrollable
            locale={locale}
            happeningCount={lifecycleCounts.happening}
          />
        </Suspense>
      </div>
    </main>
  );
}