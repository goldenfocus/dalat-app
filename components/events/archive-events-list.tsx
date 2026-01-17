"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { EventCard } from "@/components/events/event-card";
import { ArchiveFilters } from "@/components/events/archive-filters";
import type { Event, EventCounts } from "@/lib/types";

interface ArchiveEventsListProps {
  events: Event[];
  counts: Record<string, EventCounts>;
  momentsCounts: Record<string, number>;
}

export function ArchiveEventsList({
  events,
  counts,
  momentsCounts,
}: ArchiveEventsListProps) {
  const t = useTranslations("archive");
  const [filteredEvents, setFilteredEvents] = useState<Event[]>(events);

  const handleFilteredEventsChange = useCallback((newEvents: Event[]) => {
    setFilteredEvents(newEvents);
  }, []);

  return (
    <>
      {/* Filters */}
      <div className="mb-6">
        <ArchiveFilters
          events={events}
          counts={counts}
          momentsCounts={momentsCounts}
          onFilteredEventsChange={handleFilteredEventsChange}
        />
      </div>

      {/* Events grid */}
      {filteredEvents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} counts={counts[event.id]} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("noResults")}</p>
        </div>
      )}
    </>
  );
}
