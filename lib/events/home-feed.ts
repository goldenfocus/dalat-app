import { cache } from "react";
import { getCachedEventsByLifecycle } from "@/lib/cache/server-cache";
import { takeSoonestEventPerVenue } from "@/lib/events/one-per-venue";
import type { EventWithSeriesData } from "@/lib/types";

const HAPPENING_LIMIT = 5;
const UPCOMING_LIMIT = 12;
// Series-deduped rows to read before venue collapse, so one nightly venue
// cannot consume the visible slots.
const HOME_FEED_CANDIDATE_LIMIT = 120;

export interface HomeFeed {
  /** The one plan the homepage leads with: a live event, else the next one. */
  featured: { event: EventWithSeriesData; live: boolean } | null;
  /** Live events after the featured one. */
  happeningEvents: EventWithSeriesData[];
  /** Upcoming events after the featured one. */
  upcomingEvents: EventWithSeriesData[];
  /** Other events at the same venue, keyed by the kept event id. */
  moreAtVenueByEventId: Record<string, number>;
  /** One-per-venue hides rows, so "see all" follows hidden rows too. */
  hasMoreUpcoming: boolean;
}

/**
 * Homepage event selection, shared by the page (LCP preload) and the feed
 * (cards) so both always agree on which event is visually first.
 * React cache() makes the second caller in a request free.
 */
export const getHomeFeed = cache(
  async (hasHappening: boolean): Promise<HomeFeed> => {
    // Over-fetch, then keep one soonest event per venue before the slot limit.
    const [happeningCandidates, upcomingCandidates] = await Promise.all([
      hasHappening
        ? getCachedEventsByLifecycle("happening", HOME_FEED_CANDIDATE_LIMIT)
        : Promise.resolve([]),
      getCachedEventsByLifecycle("upcoming", HOME_FEED_CANDIDATE_LIMIT),
    ]);

    const happeningPick = takeSoonestEventPerVenue(
      happeningCandidates,
      HAPPENING_LIMIT,
      { featuredFirst: true },
    );
    const featuredIsLive = happeningPick.events.length > 0;
    // The featured slot takes one upcoming event when nothing is live, so
    // read one more to keep the grid full.
    const upcomingPick = takeSoonestEventPerVenue(
      upcomingCandidates,
      UPCOMING_LIMIT + (featuredIsLive ? 0 : 1),
      { featuredFirst: true },
    );

    const [featuredEvent] = featuredIsLive
      ? happeningPick.events
      : upcomingPick.events;

    return {
      featured: featuredEvent
        ? { event: featuredEvent, live: featuredIsLive }
        : null,
      happeningEvents: featuredIsLive
        ? happeningPick.events.slice(1)
        : happeningPick.events,
      upcomingEvents: featuredIsLive
        ? upcomingPick.events
        : upcomingPick.events.slice(1),
      moreAtVenueByEventId: {
        ...happeningPick.moreAtVenueByEventId,
        ...upcomingPick.moreAtVenueByEventId,
      },
      hasMoreUpcoming: upcomingCandidates.length > upcomingPick.events.length,
    };
  },
);
