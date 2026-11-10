import { Suspense } from "react";
import { preload } from "react-dom";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;

// Lifecycle sections can change purely because the clock moved. Keep the
// server payload within the same one-minute freshness window as the event RPCs.
export const revalidate = 60;

import { setRequestLocale } from "next-intl/server";
import { HeroSection } from "@/components/home/hero-section";
import { EventFeedScrollable, EventFeedScrollableSkeleton } from "@/components/events/event-feed-scrollable";
import { YourEventsSection } from "@/components/home/your-events-section";
import { isVideoUrl } from "@/lib/media-utils";
import { heroImageSources } from "@/lib/events/hero-image";
import { getHomeFeed } from "@/lib/events/home-feed";
import { getCardCoverUrl } from "@/lib/events/social-proof";
import type { Locale } from "@/lib/i18n/routing";
import {
  getCachedDiscoveryWindowCounts,
  getCachedLifecycleCounts,
  getCachedHomepageConfig,
} from "@/lib/cache/server-cache";
import { HeroImageSection } from "@/components/home/hero-image-section";
import { MomentsStripServer } from "@/components/home/moments-strip-server";
import { TribesStrip } from "@/components/home/tribes-strip";
import { JsonLd, generateWebSiteSchema } from "@/lib/structured-data";
import { CityPulseNav } from "@/components/home/city-pulse-nav";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  // Enable static rendering with correct locale for translations
  setRequestLocale(locale);

  const [lifecycleCounts, discoveryCounts, homepageConfig] = await Promise.all([
    getCachedLifecycleCounts(),
    getCachedDiscoveryWindowCounts(),
    getCachedHomepageConfig(),
  ]);

  // Preload the LCP image: with a hero configured, HeroImageSection preloads
  // its own image; otherwise preload the featured card's photo. getHomeFeed is
  // the same (request-cached) selection the feed renders, and heroImageSources
  // the same srcset/sizes its <img> uses, so the browser fetches one candidate
  // once. A community-photo fallback cover is resolved later and not preloaded.
  if (!homepageConfig?.hero_image_url) {
    const { featured } = await getHomeFeed(lifecycleCounts.happening > 0);
    const coverUrl = getCardCoverUrl(featured?.event.image_url, undefined);
    if (coverUrl && !isVideoUrl(coverUrl)) {
      const { src, srcSet, sizes } = heroImageSources(coverUrl);
      preload(src, {
        as: "image",
        fetchPriority: "high",
        imageSrcSet: srcSet,
        imageSizes: sizes,
      });
    }
  }

  // Generate WebSite schema for sitelinks search box in Google
  const websiteSchema = generateWebSiteSchema(locale);

  return (
    <>
      <JsonLd data={websiteSchema} />
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

      {/* Time-first city pulse: only shows "live" when real events are underway */}
      <CityPulseNav
        hasHappening={lifecycleCounts.happening > 0}
        hasTonight={(discoveryCounts.tonight ?? 0) > 0}
        hasWeekend={(discoveryCounts.weekend ?? 0) > 0}
      />

      {/* Main content - Scrollable event feed */}
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Your Events - personalized section for logged-in users */}
        <Suspense fallback={null}>
          <YourEventsSection locale={locale} />
        </Suspense>

        {/* Scrollable event feed with "Happening Now" and "Coming Up" sections */}
        <Suspense fallback={<EventFeedScrollableSkeleton />}>
          <EventFeedScrollable
            locale={locale}
            happeningCount={lifecycleCounts.happening}
            afterFeatured={
              // Recent moments - real community activity keeps thin weeks alive.
              // Full-bleed on phones: cancel the container gutter.
              <div className="-mx-4 lg:mx-0">
                <Suspense fallback={null}>
                  <MomentsStripServer />
                </Suspense>
              </div>
            }
          />
        </Suspense>

        {/* Tribes discovery strip */}
        <Suspense fallback={null}>
          <TribesStrip />
        </Suspense>
      </div>
    </main>
    </>
  );
}
