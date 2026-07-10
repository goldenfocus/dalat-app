import { Suspense } from "react";
import { preload } from "react-dom";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;

// ISR: Cache homepage for 5 minutes for better PageSpeed scores
// Longer cache = fewer cache misses = faster TTFB
export const revalidate = 300;

import { setRequestLocale } from "next-intl/server";
import { HeroSection } from "@/components/home/hero-section";
import { EventFeedScrollable, EventFeedScrollableSkeleton } from "@/components/events/event-feed-scrollable";
import { YourEventsSection } from "@/components/home/your-events-section";
import { cloudflareLoader } from "@/lib/image-cdn";
import { isVideoUrl } from "@/lib/media-utils";
import type { Locale } from "@/lib/i18n/routing";
import {
  getCachedEventsByLifecycle,
  getCachedLifecycleCounts,
  getCachedHomepageConfig,
} from "@/lib/cache/server-cache";
import { HeroImageSection } from "@/components/home/hero-image-section";
import { MomentsStripServer } from "@/components/home/moments-strip-server";
import { ForYouSection } from "@/components/home/for-you-section";
import { TribesStrip } from "@/components/home/tribes-strip";
import { RecommendedEventsProvider } from "@/components/home/recommended-events-context";
import { JsonLd, generateWebSiteSchema } from "@/lib/structured-data";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Mirrors the srcset next/image emits for the visually-first event card
// (fill + cloudflareLoader, quality 70): EVENT_CARD_SIZES matches
// EventCardFramed ("Coming Up"), HERO_CARD_SIZES matches EventHeroCard
// ("Happening Now"). Both sizes yield the same width list, so the preload
// and the card share one download either way.
const EVENT_CARD_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw";
const HERO_CARD_SIZES = "(max-width: 640px) 100vw, 40vw";
const EVENT_CARD_WIDTHS = [256, 384, 640, 750, 828, 1080, 1200, 1920];

export default async function Home({ params }: PageProps) {
  const { locale } = await params;

  // Enable static rendering with correct locale for translations
  setRequestLocale(locale);

  const [lifecycleCounts, homepageConfig] = await Promise.all([
    getCachedLifecycleCounts(),
    getCachedHomepageConfig(),
  ]);

  // Preload the LCP image: with a hero configured, HeroImageSection preloads
  // its own image; otherwise preload the visually-first event card's image —
  // the "Happening Now" hero card when there are live events, else the first
  // "Coming Up" card
  if (!homepageConfig?.hero_image_url) {
    const hasHappening = lifecycleCounts.happening > 0;
    const events = await getCachedEventsByLifecycle(
      hasHappening ? "happening" : "upcoming",
      1
    );
    const cardImageUrl = events[0]?.image_url;
    if (cardImageUrl && !isVideoUrl(cardImageUrl)) {
      preload(cloudflareLoader({ src: cardImageUrl, width: 1920 }), {
        as: "image",
        fetchPriority: "high",
        imageSrcSet: EVENT_CARD_WIDTHS.map(
          (width) => `${cloudflareLoader({ src: cardImageUrl, width })} ${width}w`
        ).join(", "),
        imageSizes: hasHappening ? HERO_CARD_SIZES : EVENT_CARD_SIZES,
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

      {/* Recent Moments Strip - Instagram Stories style */}
      <Suspense fallback={null}>
        <MomentsStripServer />
      </Suspense>

      {/* Main content - Scrollable event feed */}
      <div className="flex-1 container max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Your Events - personalized section for logged-in users */}
        <Suspense fallback={null}>
          <YourEventsSection locale={locale} />
        </Suspense>

        {/* Provider shares recommended IDs so Coming Up can dedup */}
        <RecommendedEventsProvider>
          {/* For You - personalized recommendations */}
          <Suspense fallback={null}>
            <ForYouSection />
          </Suspense>

          {/* Scrollable event feed with "Happening Now" and "Coming Up" sections */}
          <Suspense fallback={<EventFeedScrollableSkeleton />}>
            <EventFeedScrollable
              locale={locale}
              happeningCount={lifecycleCounts.happening}
            />
          </Suspense>
        </RecommendedEventsProvider>

        {/* Tribes discovery strip */}
        <Suspense fallback={null}>
          <TribesStrip />
        </Suspense>
      </div>
    </main>
    </>
  );
}