import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { Radio, Calendar, History } from "lucide-react";
import {
  EventHeroCardServer,
  resolveHeroTimeDisplay,
} from "./event-hero-card-server";
import { EventCardFramedServer } from "./event-card-framed-server";
import { EventGridWithViews } from "./event-grid-with-views";
import { EventViewToggle } from "./event-view-toggle";
import { getPastProof, shouldShowGoingCount } from "@/lib/events/social-proof";
import type {
  CardEvent,
  ContentLocale,
  EventWithSeriesData,
  Locale,
} from "@/lib/types";
import { getEventTranslationsBatch } from "@/lib/translations";
import {
  getCachedEventsByLifecycle,
  getCachedEventCountsBatch,
  getCachedEventSocialBatch,
} from "@/lib/cache/server-cache";

interface EventFeedScrollableProps {
  locale: Locale;
  happeningCount: number;
}

/** Strip full RPC rows down to the fields cards actually render. */
function toCardEvent(event: EventWithSeriesData): CardEvent {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    image_url: event.image_url,
    image_fit: event.image_fit,
    focal_point: event.focal_point,
    location_name: event.location_name,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    capacity: event.capacity,
    sponsor_tier: event.sponsor_tier,
    source_locale: event.source_locale,
  };
}

/**
 * Scrollable event feed with "Happening Now" and "Coming Up" sections.
 * Default grid is server-first (no card hydration); view prefs enhance client-side.
 */
export async function EventFeedScrollable({
  locale,
  happeningCount,
}: EventFeedScrollableProps) {
  const t = await getTranslations("home");
  const tEvents = await getTranslations("events");

  // Fetch happening events only if there are any
  const happeningEvents =
    happeningCount > 0 ? await getCachedEventsByLifecycle("happening", 5) : [];

  // Always fetch upcoming events
  const upcomingEvents = await getCachedEventsByLifecycle("upcoming", 12);

  // Gather all event IDs for batch fetching
  const allEventIds = [
    ...happeningEvents.map((e) => e.id),
    ...upcomingEvents.map((e) => e.id),
  ];

  // Batch fetch counts, social-proof data, and translations
  const [counts, social, eventTranslations] = await Promise.all([
    getCachedEventCountsBatch(allEventIds),
    getCachedEventSocialBatch(allEventIds),
    getEventTranslationsBatch(allEventIds, locale as ContentLocale),
  ]);

  // Build series rrules map
  const seriesRrules: Record<string, string> = {};
  [...happeningEvents, ...upcomingEvents].forEach((event) => {
    if (event.series_rrule) {
      seriesRrules[event.id] = event.series_rrule;
    }
  });

  // Only serialize card-rendered fields to the client
  const happeningCardEvents = happeningEvents.map(toCardEvent);
  const upcomingCardEvents = upcomingEvents.map(toCardEvent);

  // Serializable translations for the client view-switcher
  const translationsRecord: Record<string, { title?: string } | undefined> = {};
  for (const event of [...happeningCardEvents, ...upcomingCardEvents]) {
    if (event.source_locale === locale) continue;
    const tr = eventTranslations.get(event.id);
    if (tr) translationsRecord[event.id] = { title: tr.title };
  }

  const popularLabel = tEvents("popular");

  return (
    <div className="space-y-8">
      {/* HAPPENING NOW — server-first hero cards */}
      {happeningEvents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 text-red-500">
              <Radio className="w-5 h-5 animate-pulse" />
              <h2 className="text-lg font-bold tracking-tight">
                {t("happeningNow.title")}
              </h2>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-red-500/50 to-transparent" />
          </div>

          <div className="space-y-4">
            {happeningCardEvents.map((event) => {
              const translation =
                event.source_locale === locale
                  ? undefined
                  : eventTranslations.get(event.id);
              return (
                <EventHeroCardServer
                  key={event.id}
                  event={event}
                  counts={counts[event.id]}
                  social={social[event.id]}
                  translatedTitle={translation?.title}
                  labels={{
                    live: t("happeningNow.live"),
                    tapToJoin: t("happeningNow.tapToJoin"),
                    going: tEvents("going"),
                    timeDisplay: resolveHeroTimeDisplay(event, locale, {
                      startedAgo: (minutes) =>
                        t("happeningNow.startedAgo", { minutes }),
                      endsAt: (time) => t("happeningNow.endsAt", { time }),
                    }),
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* COMING UP — server-first default grid + client view island */}
      <section>
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

        <EventGridWithViews
          events={upcomingCardEvents}
          counts={counts}
          social={social}
          eventTranslations={translationsRecord}
          seriesRrules={seriesRrules}
        >
          {/* Default view: server-rendered framed cards — no hydration */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
            {upcomingCardEvents.map((event, index) => {
              const translation =
                event.source_locale === locale
                  ? undefined
                  : eventTranslations.get(event.id);
              const goingSpots = counts[event.id]?.going_spots ?? 0;
              const pastProof = getPastProof(social[event.id]);

              return (
                <EventCardFramedServer
                  key={event.id}
                  event={event}
                  counts={counts[event.id]}
                  social={social[event.id]}
                  seriesRrule={seriesRrules[event.id]}
                  translatedTitle={translation?.title}
                  priority={index === 0}
                  locale={locale}
                  labels={{
                    popular: popularLabel,
                    spotsAvailable:
                      event.capacity && !shouldShowGoingCount(goingSpots)
                        ? tEvents("spotsAvailable", {
                            count: event.capacity - goingSpots,
                          })
                        : "",
                    photoBy: social[event.id]?.fallback_photo_credit
                      ? tEvents("photoBy", {
                          name: social[event.id]!.fallback_photo_credit!,
                        })
                      : "",
                    pastProofBoth:
                      pastProof?.kind === "both"
                        ? tEvents("pastProofBoth", {
                            went: pastProof.went,
                            photos: pastProof.photos,
                          })
                        : "",
                    pastProofPhotos:
                      pastProof?.kind === "photos"
                        ? tEvents("pastProofPhotos", {
                            photos: pastProof.photos,
                          })
                        : "",
                    pastProofWent:
                      pastProof?.kind === "went"
                        ? tEvents("pastProofWent", { went: pastProof.went })
                        : "",
                  }}
                />
              );
            })}
          </div>
        </EventGridWithViews>

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
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-muted rounded animate-pulse" />
          <div className="w-32 h-6 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 sm:h-80 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
