"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { formatInDaLat } from "@/lib/timezone";
import { EventCard } from "./event-card";
import { EventCardCompact } from "./event-card-compact";
import { EventListCard } from "./event-list-card";
import { EventImmersiveCard } from "./event-immersive-card";
import {
  useEventViewPreferences,
  type EventDensity,
} from "@/lib/hooks/use-local-storage";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface EventGridProps {
  events: Event[];
  counts: Record<string, EventCounts | undefined>;
  eventTranslations: Map<string, { title?: string }>;
  seriesRrules?: Record<string, string>;
}

// Grid classes based on density
const GRID_CLASSES: Record<EventDensity, string> = {
  compact: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3",
  default: "grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5",
  spacious: "grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6",
};

// List spacing based on density (gap between cards within a date group)
const LIST_CLASSES: Record<EventDensity, string> = {
  compact: "gap-2",
  default: "gap-3",
  spacious: "gap-4",
};

/**
 * Groups events by their start date (in Da Lat timezone).
 * Returns an array of [dateKey, events[]] tuples.
 */
function groupEventsByDate(events: Event[]): [string, Event[]][] {
  const groups = new Map<string, Event[]>();

  for (const event of events) {
    // Use ISO date as key for grouping (yyyy-MM-dd in Da Lat timezone)
    const dateKey = formatInDaLat(event.starts_at, "yyyy-MM-dd", "en");
    const existing = groups.get(dateKey) || [];
    existing.push(event);
    groups.set(dateKey, existing);
  }

  return Array.from(groups.entries());
}

// Immersive grid based on density (controls how many per row on larger screens)
const IMMERSIVE_CLASSES: Record<EventDensity, string> = {
  compact: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4",
  default: "grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6",
  spacious: "grid-cols-1 gap-6",
};

/**
 * Client component that renders events based on user's view preferences.
 * Supports grid, list, and immersive (TikTok-style) views.
 */
export function EventGrid({
  events,
  counts,
  eventTranslations,
  seriesRrules = {},
}: EventGridProps) {
  const { mode, density } = useEventViewPreferences();
  const locale = useLocale() as Locale;

  // Group events by date for list view
  const groupedEvents = useMemo(
    () => (mode === "list" ? groupEventsByDate(events) : []),
    [events, mode]
  );

  if (mode === "list") {
    return (
      <div className="flex flex-col gap-6">
        {groupedEvents.map(([dateKey, dateEvents]) => (
          <div key={dateKey}>
            {/* Date label - using p instead of h3 to maintain proper heading hierarchy */}
            <p className="text-sm font-medium text-foreground/70 mb-3 px-1">
              {formatInDaLat(dateEvents[0].starts_at, "EEEE, MMMM d", locale)}
            </p>
            {/* Events for this date */}
            <div className={cn("flex flex-col", LIST_CLASSES[density])}>
              {dateEvents.map((event) => {
                const translation = eventTranslations.get(event.id);
                return (
                  <EventListCard
                    key={event.id}
                    event={event}
                    counts={counts[event.id]}
                    seriesRrule={seriesRrules[event.id]}
                    translatedTitle={translation?.title}
                    hideDate
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (mode === "immersive") {
    return (
      <div className={cn("grid", IMMERSIVE_CLASSES[density])}>
        {events.map((event, index) => {
          const translation = eventTranslations.get(event.id);
          return (
            <EventImmersiveCard
              key={event.id}
              event={event}
              counts={counts[event.id]}
              seriesRrule={seriesRrules[event.id]}
              translatedTitle={translation?.title}
              priority={index === 0}
            />
          );
        })}
      </div>
    );
  }

  // Default: grid view (uses compact cards for compact density)
  if (density === "compact") {
    return (
      <div className={cn("grid", GRID_CLASSES[density])}>
        {events.map((event, index) => {
          const translation = eventTranslations.get(event.id);
          return (
            <EventCardCompact
              key={event.id}
              event={event}
              translatedTitle={translation?.title}
              priority={index < 2}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("grid", GRID_CLASSES[density])}>
      {events.map((event, index) => {
        const translation = eventTranslations.get(event.id);
        return (
          <EventCard
            key={event.id}
            event={event}
            counts={counts[event.id]}
            seriesRrule={seriesRrules[event.id]}
            translatedTitle={translation?.title}
            priority={index === 0}
          />
        );
      })}
    </div>
  );
}

/**
 * Skeleton loader that adapts to current view mode.
 */
export function EventGridSkeleton() {
  const { mode, density } = useEventViewPreferences();

  if (mode === "list") {
    return (
      <div className={cn("flex flex-col", LIST_CLASSES[density])}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-20 sm:h-24 bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (mode === "immersive") {
    return (
      <div className={cn("grid", IMMERSIVE_CLASSES[density])}>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="aspect-[9/16] sm:aspect-[3/4] bg-muted animate-pulse rounded-xl"
          />
        ))}
      </div>
    );
  }

  // Default: grid skeleton
  const skeletonCount = density === "compact" ? 8 : density === "spacious" ? 4 : 6;
  return (
    <div className={cn("grid", GRID_CLASSES[density])}>
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-muted animate-pulse rounded-lg",
            density === "compact" ? "aspect-[3/2]" : "h-64 sm:h-80"
          )}
        />
      ))}
    </div>
  );
}
