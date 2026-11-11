import { Suspense } from "react";
import { preload } from "react-dom";
import { setRequestLocale } from "next-intl/server";
import { FogFeed, FogFeedSkeleton } from "@/components/home/v3/fog-feed";
import { FogHeadline } from "@/components/home/v3/fog-headline";
import { FogTimeBoard } from "@/components/home/v3/fog-time-board";
import { MomentsStripServer } from "@/components/home/moments-strip-server";
import { TribesStrip } from "@/components/home/tribes-strip";
import { YourEventsSection } from "@/components/home/your-events-section";
import { isVideoUrl } from "@/lib/media-utils";
import { heroImageSources } from "@/lib/events/hero-image";
import { getHomeFeed } from "@/lib/events/home-feed";
import { getCardCoverUrl } from "@/lib/events/social-proof";
import type { Locale } from "@/lib/i18n/routing";
import {
  getCachedDiscoveryWindowCounts,
  getCachedLifecycleCounts,
} from "@/lib/cache/server-cache";

// Same freshness window as the homepage: lifecycle sections change with the clock.
export const maxDuration = 60;
export const revalidate = 60;

// Homepage of the preview channel: middleware serves it at /v3 (see
// lib/preview-channel.ts). It duplicates "/", so keep it out of search:
// noindex here, and the canonical inherited from the locale layout already
// points at the homepage.
export const metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function FogHomePreview({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [lifecycleCounts, discoveryCounts] = await Promise.all([
    getCachedLifecycleCounts(),
    getCachedDiscoveryWindowCounts(),
  ]);

  // Preload the LCP image: the featured card's photo. getHomeFeed is the same
  // (request-cached) selection the feed renders, and heroImageSources the same
  // srcset/sizes its <img> uses, so the browser fetches one candidate once.
  // A community-photo fallback cover is resolved later and not preloaded.
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

  return (
    <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
      <FogHeadline />

      {/* Time board: only shows "live" when real events are underway */}
      <FogTimeBoard
        hasHappening={lifecycleCounts.happening > 0}
        hasTonight={(discoveryCounts.tonight ?? 0) > 0}
        hasWeekend={(discoveryCounts.weekend ?? 0) > 0}
      />

      <div className="flex-1 container max-w-6xl mx-auto px-4 pb-4 lg:pb-6">
        {/* Your Events - personalized section for logged-in users */}
        <Suspense fallback={null}>
          <YourEventsSection locale={locale} />
        </Suspense>

        <Suspense fallback={<FogFeedSkeleton />}>
          <FogFeed
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
  );
}
