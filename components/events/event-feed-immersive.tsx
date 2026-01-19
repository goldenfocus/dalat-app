import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { History } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { EventCardImmersive } from "./event-card-immersive";
import { EventFeedImmersiveClient } from "./event-feed-immersive-client";
import { EventFeedTabs, type EventLifecycle } from "./event-feed-tabs";
import { getEventTranslationsBatch } from "@/lib/translations";
import {
  getCachedEventsByLifecycle,
  getCachedEventCountsBatch,
} from "@/lib/cache/server-cache";
import type { ContentLocale } from "@/lib/types";

interface EventFeedImmersiveProps {
  lifecycle?: EventLifecycle;
  lifecycleCounts?: { upcoming: number; happening: number; past: number };
}

function FloatingTabs({
  activeTab,
  lifecycleCounts,
  labels
}: {
  activeTab: EventLifecycle;
  lifecycleCounts?: { upcoming: number; happening: number; past: number };
  labels: { upcoming: string; happening: string; past: string };
}) {
  return (
    <Suspense fallback={null}>
      <EventFeedTabs
        activeTab={activeTab}
        variant="floating"
        useUrlNavigation
        counts={lifecycleCounts}
        hideEmptyTabs={!!lifecycleCounts}
        labels={labels}
      />
    </Suspense>
  );
}

export async function EventFeedImmersive({
  lifecycle = "upcoming",
  lifecycleCounts
}: EventFeedImmersiveProps) {
  try {
    // Use cached data fetching for faster TTFB
    const events = await getCachedEventsByLifecycle(lifecycle);
    const eventIds = events.map((e) => e.id);
    const locale = await getLocale();

    const [counts, eventTranslations, t] = await Promise.all([
      getCachedEventCountsBatch(eventIds),
      getEventTranslationsBatch(eventIds, locale as ContentLocale),
      getTranslations("home"),
    ]);

  const tabLabels = {
    upcoming: t("tabs.upcoming"),
    happening: t("tabs.happening"),
    past: t("tabs.past"),
  };

  if (events.length === 0) {
    const emptyMessage =
      lifecycle === "happening"
        ? t("noHappening")
        : lifecycle === "past"
          ? t("noPast")
          : t("noUpcoming");

    return (
      <div className="h-[100dvh] flex flex-col bg-black text-white">
        {/* Floating tabs */}
        <div className="absolute top-14 left-0 right-0 z-40 px-3">
          <FloatingTabs activeTab={lifecycle} lifecycleCounts={lifecycleCounts} labels={tabLabels} />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <p className="text-lg mb-2">{emptyMessage}</p>
            {lifecycle === "upcoming" && (
              <p className="text-white/60 text-sm">
                {t("createFirst")}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] relative">
      {/* Floating tabs below the header */}
      <div className="absolute top-14 left-0 right-0 z-40 px-3">
        <FloatingTabs activeTab={lifecycle} lifecycleCounts={lifecycleCounts} labels={tabLabels} />
      </div>

      {/* Scrollable event cards with scroll restoration */}
      <EventFeedImmersiveClient eventCount={events.length + (lifecycle === "past" ? 1 : 0)} activeTab={lifecycle}>
        {events.map((event, index) => {
          const translation = eventTranslations.get(event.id);
          return (
            <EventCardImmersive
              key={event.id}
              event={event}
              counts={counts[event.id]}
              seriesRrule={event.series_rrule ?? undefined}
              priority={index === 0}
              translatedTitle={translation?.title || undefined}
            />
          );
        })}

        {/* Browse archive card at the end of past events */}
        {lifecycle === "past" && (
          <div className="h-[100dvh] snap-start flex flex-col items-center justify-center bg-black text-white px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
                <History className="w-8 h-8 text-white/70" />
              </div>
              <p className="text-lg text-white/60 mb-8">{t("browseArchive")}</p>
              <Link
                href="/events/this-month"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black font-medium rounded-full active:scale-95 transition-transform"
              >
                {t("browseArchive")} →
              </Link>
            </div>
          </div>
        )}
      </EventFeedImmersiveClient>
    </div>
  );
  } catch (err) {
    console.error("EventFeedImmersive error:", err);
    // Return a fallback UI instead of throwing
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-black text-white">
        <p className="text-lg mb-2">Unable to load events</p>
        <p className="text-white/60 text-sm">Please try again later</p>
      </div>
    );
  }
}
