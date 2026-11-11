import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { Calendar, History, Images } from "lucide-react";
import { resolveHeroTimeDisplay } from "@/components/events/event-hero-card-server";
import { EventCardFramedServer } from "@/components/events/event-card-framed-server";
import { EventGridWithViews } from "@/components/events/event-grid-with-views";
import { EventViewToggle } from "@/components/events/event-view-toggle";
import {
  MoreAtVenueHomeLink,
  type MoreAtVenueHomeLinkData,
} from "@/components/events/more-at-venue-home-link";
import { FogFeaturedCard } from "./fog-featured-card";
import { getPastProof, shouldShowGoingCount } from "@/lib/events/social-proof";
import { getHomeFeed } from "@/lib/events/home-feed";
import { hasLamVienTbdSchedule } from "@/lib/activity-graph/lam-vien-tbd";
import { formatInDaLatAsync, loadDateFnsLocale } from "@/lib/timezone";
import type {
  CardEvent,
  ContentLocale,
  EventWithSeriesData,
  Locale,
} from "@/lib/types";
import { getEventTranslationsBatch } from "@/lib/translations";
import { createStaticClient } from "@/lib/supabase/server";
import {
  getCachedEventCountsBatch,
  getCachedEventSocialBatch,
} from "@/lib/cache/server-cache";

const FULL_UPCOMING_HREF = "/events/upcoming";
const CARD_GRID = "grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5";

interface FogFeedProps {
  locale: Locale;
  happeningCount: number;
  /** Rendered between the featured card and the rest of the feed. */
  afterFeatured?: ReactNode;
}

async function loadVenueSlugs(venueIds: string[]): Promise<Map<string, string>> {
  if (venueIds.length === 0) return new Map();
  const supabase = createStaticClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("venues")
    .select("id, slug")
    .in("id", venueIds);

  if (error || !data) return new Map();

  const slugs = new Map<string, string>();
  for (const venue of data) {
    if (venue.id && venue.slug) slugs.set(venue.id, venue.slug);
  }
  return slugs;
}

function moreAtVenueLinks(
  events: EventWithSeriesData[],
  moreByEventId: Record<string, number>,
  slugs: Map<string, string>,
  labelFor: (count: number) => string,
): Record<string, MoreAtVenueHomeLinkData> {
  const links: Record<string, MoreAtVenueHomeLinkData> = {};
  for (const event of events) {
    const count = moreByEventId[event.id];
    if (!count) continue;
    const venueId = event.venue_id?.trim();
    const slug = venueId ? slugs.get(venueId) : undefined;
    // Most scraped events have only a place name, no venue row. They are still
    // grouped by that name, so point the hint at the full upcoming list rather
    // than hiding how many events the venue has.
    links[event.id] = {
      href: slug ? `/venues/${slug}` : FULL_UPCOMING_HREF,
      label: labelFor(count),
    };
  }
  return links;
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
    source_metadata: event.source_metadata,
    source_platform: event.source_platform,
  };
}

/**
 * Fog Hour home feed (the /v3 preview): one featured plan (live, else the
 * next one), then anything else underway, then "Coming Up".
 * Server-first (no card hydration); view prefs enhance client-side.
 */
export async function FogFeed({
  locale,
  happeningCount,
  afterFeatured,
}: FogFeedProps) {
  const [t, tEvents, tFeed, feed] = await Promise.all([
    getTranslations("home"),
    getTranslations("events"),
    getTranslations("feed"),
    getHomeFeed(happeningCount > 0),
    // Cards format dates with the sync helper, which falls back to English
    // until the locale is cached. Warm it for a cold render.
    loadDateFnsLocale(locale),
  ]);
  const { featured, happeningEvents, upcomingEvents, hasMoreUpcoming } = feed;
  const visibleEvents = [
    ...(featured ? [featured.event] : []),
    ...happeningEvents,
    ...upcomingEvents,
  ];

  const venueIds = new Set<string>();
  for (const event of visibleEvents) {
    const venueId = event.venue_id?.trim();
    if (feed.moreAtVenueByEventId[event.id] && venueId) venueIds.add(venueId);
  }
  const allEventIds = visibleEvents.map((event) => event.id);

  // Batch fetch venue slugs, counts, social-proof data, and translations
  const [venueSlugs, counts, social, eventTranslations] = await Promise.all([
    loadVenueSlugs([...venueIds]),
    getCachedEventCountsBatch(allEventIds),
    getCachedEventSocialBatch(allEventIds),
    getEventTranslationsBatch(allEventIds, locale as ContentLocale),
  ]);
  const moreAtVenue = moreAtVenueLinks(
    visibleEvents,
    feed.moreAtVenueByEventId,
    venueSlugs,
    (count) => t("moreAtThisVenue", { count }),
  );

  // Build series rrules map
  const seriesRrules: Record<string, string> = {};
  for (const event of visibleEvents) {
    if (event.series_rrule) seriesRrules[event.id] = event.series_rrule;
  }

  // Only serialize card-rendered fields to the client
  const featuredCardEvent = featured ? toCardEvent(featured.event) : null;
  const happeningCardEvents = happeningEvents.map(toCardEvent);
  const upcomingCardEvents = upcomingEvents.map(toCardEvent);

  // Serializable translations for the client view-switcher
  const translationsRecord: Record<string, { title?: string } | undefined> = {};
  for (const event of upcomingCardEvents) {
    if (event.source_locale === locale) continue;
    const tr = eventTranslations.get(event.id);
    if (tr) translationsRecord[event.id] = { title: tr.title };
  }

  const translatedTitle = (event: CardEvent) =>
    event.source_locale === locale
      ? undefined
      : eventTranslations.get(event.id)?.title;

  let featuredTime = "";
  if (featured && featuredCardEvent) {
    if (featured.live) {
      featuredTime = resolveHeroTimeDisplay(featuredCardEvent, locale, {
        startedAgo: (minutes) => t("happeningNow.startedAgo", { minutes }),
        endsAt: (time) => t("happeningNow.endsAt", { time }),
      });
    } else {
      const [day, time] = await Promise.all([
        formatInDaLatAsync(featuredCardEvent.starts_at, "EEE, MMM d", locale),
        hasLamVienTbdSchedule(featuredCardEvent.source_metadata)
          ? "TBD"
          : formatInDaLatAsync(featuredCardEvent.starts_at, "h:mm a", locale),
      ]);
      featuredTime = `${day} · ${time}`;
    }
  }

  const popularLabel = tEvents("popular");
  const framedCard = (event: CardEvent) => {
    const goingSpots = counts[event.id]?.going_spots ?? 0;
    const pastProof = getPastProof(social[event.id]);
    const photoCredit = social[event.id]?.fallback_photo_credit;
    const more = moreAtVenue[event.id];
    return (
      <div key={event.id} className="min-w-0">
        <EventCardFramedServer
          event={event}
          counts={counts[event.id]}
          social={social[event.id]}
          seriesRrule={seriesRrules[event.id]}
          translatedTitle={translatedTitle(event)}
          locale={locale}
          labels={{
            popular: popularLabel,
            going: tEvents("going"),
            spotsAvailable:
              event.capacity && !shouldShowGoingCount(goingSpots)
                ? tEvents("spotsAvailable", {
                    count: event.capacity - goingSpots,
                  })
                : "",
            photoBy: photoCredit ? tEvents("photoBy", { name: photoCredit }) : "",
            pastProofBoth:
              pastProof?.kind === "both"
                ? tEvents("pastProofBoth", {
                    went: pastProof.went,
                    photos: pastProof.photos,
                  })
                : "",
            pastProofPhotos:
              pastProof?.kind === "photos"
                ? tEvents("pastProofPhotos", { photos: pastProof.photos })
                : "",
            pastProofWent:
              pastProof?.kind === "went"
                ? tEvents("pastProofWent", { went: pastProof.went })
                : "",
          }}
        />
        {more ? (
          <MoreAtVenueHomeLink href={more.href} label={more.label} />
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* FEATURED — the one plan the page leads with; also the LCP image */}
      {featured && featuredCardEvent && (
        <section
          id={featured.live ? "happening-now" : undefined}
          className="scroll-mt-20"
        >
          <FogFeaturedCard
            event={featuredCardEvent}
            counts={counts[featuredCardEvent.id]}
            social={social[featuredCardEvent.id]}
            translatedTitle={translatedTitle(featuredCardEvent)}
            labels={{
              live: featured.live ? t("happeningNow.live") : undefined,
              cta: featured.live
                ? t("happeningNow.tapToJoin")
                : tFeed("viewEvent"),
              going: tEvents("going"),
              timeDisplay: featuredTime,
            }}
          />
          {moreAtVenue[featuredCardEvent.id] ? (
            <MoreAtVenueHomeLink {...moreAtVenue[featuredCardEvent.id]} />
          ) : null}
        </section>
      )}

      {afterFeatured}

      {/* ALSO HAPPENING NOW — other live events */}
      {happeningCardEvents.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-red-500"
              aria-hidden="true"
            />
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              {t("happeningNow.title")}
            </h2>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <div className={CARD_GRID}>{happeningCardEvents.map(framedCard)}</div>
        </section>
      )}

      {/* COMING UP — server-first default grid + client view island.
          Skipped when the featured card already shows the only plan. */}
      {(upcomingCardEvents.length > 0 || !featured) && (
      <section id="upcoming-events" className="scroll-mt-20">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {t("comingUp.title")}
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          {upcomingCardEvents.length > 0 && <EventViewToggle />}
        </div>

        {upcomingCardEvents.length > 0 ? (
          <EventGridWithViews
            events={upcomingCardEvents}
            counts={counts}
            social={social}
            eventTranslations={translationsRecord}
            seriesRrules={seriesRrules}
            moreAtVenue={moreAtVenue}
          >
            {/* Default view: server-rendered framed cards — no hydration */}
            <div className={CARD_GRID}>{upcomingCardEvents.map(framedCard)}</div>
          </EventGridWithViews>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-muted/30 px-5 py-8 text-center sm:px-8 sm:py-10">
            <Calendar
              className="mx-auto h-8 w-8 text-muted-foreground/60"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">
              {t("comingUp.emptyTitle")}
            </h3>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t("comingUp.emptyDescription")}
            </p>
            <Link
              href="/moments"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted active:scale-[0.98]"
            >
              <Images className="h-4 w-4" aria-hidden="true" />
              {t("comingUp.emptyCta")}
            </Link>
          </div>
        )}

        {hasMoreUpcoming && (
          <div className="text-center pt-4">
            <Link
              href={FULL_UPCOMING_HREF}
              className="inline-flex min-h-11 items-center px-3 text-sm text-foreground/70 hover:text-foreground active:scale-[0.98] transition-all underline-offset-4 hover:underline"
            >
              {t("seeAllUpcoming")} →
            </Link>
          </div>
        )}
      </section>
      )}

      <div className="pt-4 border-t border-border/50">
        <Link
          href="/events/this-month"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all"
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
export function FogFeedSkeleton() {
  return (
    <div className="space-y-8">
      {/* Same box as the featured card, so the feed streams in without a shift */}
      <div className="aspect-[4/5] max-h-[36rem] w-full animate-pulse rounded-lg bg-muted sm:aspect-[16/9] lg:aspect-[2/1]" />
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-32 h-6 bg-muted rounded animate-pulse" />
        </div>
        <div className={CARD_GRID}>
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
