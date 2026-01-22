"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { format, startOfDay, startOfMonth } from "date-fns";
import type { Event } from "@/lib/types";
import type { EventTag } from "@/lib/constants/event-tags";
import { TagFilterBar } from "@/components/events/tag-filter-bar";
import { formatInDaLat } from "@/lib/timezone";
import { CalendarHeader } from "./calendar-header";
import type { CalendarView } from "./view-switcher";
import { DayView } from "./views/day-view";
import { WeekView } from "./views/week-view";
import { MonthView } from "./views/month-view";

interface EventCalendarProps {
  events: Event[];
}

// Parse view from URL param, returns null if invalid/missing
function parseViewFromUrl(urlView: string | null): CalendarView | null {
  if (urlView === "day" || urlView === "week" || urlView === "month") {
    return urlView;
  }
  return null;
}

export function EventCalendar({ events }: EventCalendarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track whether view was explicitly set via URL
  const urlViewParam = searchParams.get("view");
  const initialViewFromUrl = parseViewFromUrl(urlViewParam);

  // Initialize state from URL params or use "week" as safe default for SSR
  // The useEffect below will adjust to "month" on desktop after hydration if needed
  const [view, setView] = useState<CalendarView>(initialViewFromUrl ?? "week");
  const [hasHydrated, setHasHydrated] = useState(false);

  // After hydration, adjust view based on screen width (only if no URL param was set)
  useEffect(() => {
    if (!hasHydrated) {
      setHasHydrated(true);
      // Only auto-adjust if there was no explicit view in URL
      if (!initialViewFromUrl && window.innerWidth >= 1024) {
        setView("month");
      }
    }
  }, [hasHydrated, initialViewFromUrl]);

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const urlDate = searchParams.get("date");
    if (urlDate) {
      const parsed = new Date(urlDate);
      if (!isNaN(parsed.getTime())) {
        return startOfDay(parsed);
      }
    }
    return startOfDay(new Date());
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    // For week/month views, default to today if viewing current period
    return startOfDay(new Date());
  });

  const [selectedTag, setSelectedTag] = useState<EventTag | null>(null);

  // Update URL when view or date changes
  // Note: searchParams is intentionally NOT in deps - we only push state to URL,
  // we don't react to URL changes (which would cause an infinite loop)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("date", format(currentDate, "yyyy-MM-dd"));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate, pathname, router]);

  // Filter events by selected tag
  const filteredEvents = selectedTag
    ? events.filter(event => event.ai_tags?.includes(selectedTag))
    : events;

  // Group events by date (in Da Lat timezone)
  const eventsByDate = useMemo(() => {
    const groups: Record<string, Event[]> = {};

    filteredEvents.forEach(event => {
      // Get date in Da Lat timezone
      const dateKey = formatInDaLat(event.starts_at, "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    return groups;
  }, [filteredEvents]);

  const handleViewChange = useCallback((newView: CalendarView) => {
    setView(newView);
    // When switching views, if going to month view, adjust currentDate to month start
    if (newView === "month") {
      setCurrentDate(prev => startOfMonth(prev));
    }
  }, []);

  const handleDateChange = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleToday = useCallback(() => {
    const today = startOfDay(new Date());
    setCurrentDate(today);
    setSelectedDate(today);
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleTagChange = useCallback((tag: EventTag | null) => {
    setSelectedTag(tag);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Tag filter bar */}
      <div className="p-3 bg-background border-b">
        <TagFilterBar
          selectedTag={selectedTag}
          onTagChange={handleTagChange}
        />
      </div>

      {/* Calendar header with view switcher */}
      <CalendarHeader
        view={view}
        currentDate={view === "month" ? startOfMonth(currentDate) : currentDate}
        onViewChange={handleViewChange}
        onDateChange={handleDateChange}
        onToday={handleToday}
      />

      {/* View content with fade transition */}
      <div className="flex-1 min-h-0 relative">
        <div
          key={view}
          className="h-full animate-in fade-in duration-200"
        >
          {view === "day" && (
            <DayView
              events={filteredEvents}
              eventsByDate={eventsByDate}
              currentDate={currentDate}
            />
          )}
          {view === "week" && (
            <WeekView
              events={filteredEvents}
              eventsByDate={eventsByDate}
              startDate={currentDate}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          )}
          {view === "month" && (
            <MonthView
              events={filteredEvents}
              eventsByDate={eventsByDate}
              currentMonth={currentDate}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
