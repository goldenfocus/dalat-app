"use client";

import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { EventListCard } from "./event-list-card";
import { EventImmersiveCard } from "./event-immersive-card";
import {
  useEventViewPreferences,
  type EventDensity,
} from "@/lib/hooks/use-local-storage";
import type { Event, EventCounts } from "@/lib/types";

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

// List spacing based on density
const LIST_CLASSES: Record<EventDensity, string> = {
  compact: "gap-2",
  default: "gap-3",
  spacious: "gap-4",
};

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

  if (mode === "list") {
    return (
      <div className={cn("flex flex-col", LIST_CLASSES[density])}>
        {events.map((event) => {
          const translation = eventTranslations.get(event.id);
          return (
            <EventListCard
              key={event.id}
              event={event}
              counts={counts[event.id]}
              seriesRrule={seriesRrules[event.id]}
              translatedTitle={translation?.title}
            />
          );
        })}
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

  // Default: grid view
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
          className="h-64 sm:h-80 bg-muted animate-pulse rounded-lg"
        />
      ))}
    </div>
  );
}
