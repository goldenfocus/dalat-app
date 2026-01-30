import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { Radio, Calendar, History } from "lucide-react";
import { EventHeroCard } from "./event-hero-card";
import { EventGrid } from "./event-grid";
import { EventViewToggle } from "./event-view-toggle";
import type { ContentLocale, Locale } from "@/lib/types";
import { getEventTranslationsBatch } from "@/lib/translations";
import {
  getCachedEventsByLifecycle,
  getCachedEventCountsBatch,
} from "@/lib/cache/server-cache";

interface EventFeedScrollableProps {
  locale: Locale;
  happeningCount: number;
}

/**
 * Scrollable event feed with "Happening Now" and "Coming Up" sections.
 * No tabs - everything visible by scrolling.
 */
export async function EventFeedScrollable({
  locale,
  happeningCount,
}: EventFeedScrollableProps) {
  const t = await getTranslations("home");

  // Fetch happening events only if there are any
  const happeningEvents = happeningCount > 0
    ? await getCachedEventsByLifecycle("happening", 5)
    : [];

  // Always fetch upcoming events
  const upcomingEvents = await getCachedEventsByLifecycle("upcoming", 12);

  // Gather all event IDs for batch fetching
  const allEventIds = [
    ...happeningEvents.map((e) => e.id),
    ...upcomingEvents.map((e) => e.id),
  ];

  // Batch fetch counts and translations
  const [counts, eventTranslations] = await Promise.all([
    getCachedEventCountsBatch(allEventIds),
    getEventTranslationsBatch(allEventIds, locale as ContentLocale),
  ]);

  // Build series rrules map
  const seriesRrules: Record<string, string> = {};
  [...happeningEvents, ...upcomingEvents].forEach((event) => {
    if (event.series_rrule) {
      seriesRrules[event.id] = event.series_rrule;
    }
  });

  return (
    <div className="space-y-8">
      {/* ═══════════════════════════════════════════════════════════════════════
          HAPPENING NOW SECTION - Only shown when there are live events
          ═══════════════════════════════════════════════════════════════════════ */}
      {happeningEvents.length > 0 && (
        <section>
          {/* Section header */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 text-red-500">
              <Radio className="w-5 h-5 animate-pulse" />
              <h2 className="text-lg font-bold tracking-tight">
                {t("happeningNow.title")}
              </h2>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-red-500/50 to-transparent" />
          </div>

          {/* Hero cards for live events */}
          <div className="space-y-4">
            {happeningEvents.map((event) => {
              const translation = event.source_locale === locale
                ? undefined
                : eventTranslations.get(event.id);
              return (
                <EventHeroCard
                  key={event.id}
                  event={event}
                  counts={counts[event.id]}
                  translatedTitle={translation?.title}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          COMING UP SECTION - Always shown
          ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Section header with view toggle */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <h2 className="text-lg font-bold tracking-tight truncate">
              {t("comingUp.title")}
            </h2>
            <div className="flex-1 h-px bg-border hidden sm:block" />
          </div>
          <EventViewToggle />
        </div>

        {/* Event grid */}
        <EventGrid
          events={upcomingEvents}
          counts={counts}
          eventTranslations={eventTranslations}
          seriesRrules={seriesRrules}
        />

        {/* "See all upcoming" link */}
        {upcomingEvents.length >= 12 && (
          <div className="text-center pt-4">
            <Link
              href="/events/upcoming"
              className="text-sm text-foreground/70 hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              {t("seeAllUpcoming")} →
            </Link>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAST EVENTS LINK - Subtle footer link to archives
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="pt-4 border-t border-border/50">
        <Link
          href="/events/this-month"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          <History className="w-4 h-4" />
          <span>{t("browseArchive")}</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for the scrollable feed.
 */
export function EventFeedScrollableSkeleton() {
  return (
    <div className="space-y-8">
      {/* Coming Up section skeleton */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-muted rounded animate-pulse" />
          <div className="w-32 h-6 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/2] bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
