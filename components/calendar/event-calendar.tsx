"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { format, startOfDay, startOfMonth, startOfWeek, parseISO, isWithinInterval, endOfDay } from "date-fns";
import type { Event } from "@/lib/types";
import type { EventTag } from "@/lib/constants/event-tags";
import { formatInDaLat } from "@/lib/timezone";
import { CalendarHeader } from "./calendar-header";
import { TripPlanner } from "./trip-planner";
import type { CalendarView } from "./view-switcher";
import { DayView } from "./views/day-view";
import { WeekView } from "./views/week-view";
import { MonthView } from "./views/month-view";

interface EventCalendarProps {
  events: Event[];
}

// Get default view based on screen width
function getDefaultView(): CalendarView {
  if (typeof window !== "undefined") {
    return window.innerWidth >= 1024 ? "month" : "week";
  }
  return "week";
}

export function EventCalendar({ events }: EventCalendarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize state from URL params or defaults
  const [view, setView] = useState<CalendarView>(() => {
    const urlView = searchParams?.get("view");
    if (urlView === "day" || urlView === "week" || urlView === "month") {
      return urlView;
    }
    return getDefaultView();
  });

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const urlDate = searchParams?.get("date");
    const urlView = searchParams?.get("view");

    let date: Date;
    if (urlDate) {
      const parsed = new Date(urlDate);
      date = !isNaN(parsed.getTime()) ? startOfDay(parsed) : startOfDay(new Date());
    } else {
      date = startOfDay(new Date());
    }

    // Adjust for view type
    const viewType = urlView === "day" || urlView === "week" || urlView === "month"
      ? urlView
      : getDefaultView();

    if (viewType === "week") {
      return startOfWeek(date, { weekStartsOn: 1 });
    } else if (viewType === "month") {
      return startOfMonth(date);
    }
    return date;
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    // For week/month views, default to today if viewing current period
    return startOfDay(new Date());
  });

  const [selectedTag, setSelectedTag] = useState<EventTag | null>(null);

  // Trip planner state - initialized from URL params
  const [tripStartDate, setTripStartDate] = useState<string | null>(() => {
    return searchParams?.get("from") ?? null;
  });
  const [tripEndDate, setTripEndDate] = useState<string | null>(() => {
    return searchParams?.get("to") ?? null;
  });

  // Update URL when view, date, or trip dates change
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("view", view);
    params.set("date", format(currentDate, "yyyy-MM-dd"));

    // Handle trip date params
    if (tripStartDate) {
      params.set("from", tripStartDate);
    } else {
      params.delete("from");
    }
    if (tripEndDate) {
      params.set("to", tripEndDate);
    } else {
      params.delete("to");
    }

    const base = pathname ?? "/";
    router.replace(`${base}?${params.toString()}`, { scroll: false });
  }, [view, currentDate, tripStartDate, tripEndDate, pathname, router, searchParams]);

  // Filter events by selected tag and trip dates
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by tag
    if (selectedTag) {
      filtered = filtered.filter(event => event.ai_tags?.includes(selectedTag));
    }

    // Filter by trip date range
    if (tripStartDate && tripEndDate) {
      const start = startOfDay(parseISO(tripStartDate));
      const end = endOfDay(parseISO(tripEndDate));
      filtered = filtered.filter(event => {
        const eventDate = parseISO(event.starts_at);
        return isWithinInterval(eventDate, { start, end });
      });
    }

    return filtered;
  }, [events, selectedTag, tripStartDate, tripEndDate]);

  // Count events in trip range (before tag filter)
  const tripEventCount = useMemo(() => {
    if (!tripStartDate || !tripEndDate) return 0;
    const start = startOfDay(parseISO(tripStartDate));
    const end = endOfDay(parseISO(tripEndDate));
    return events.filter(event => {
      const eventDate = parseISO(event.starts_at);
      return isWithinInterval(eventDate, { start, end });
    }).length;
  }, [events, tripStartDate, tripEndDate]);

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
    // When switching views, reset to today with appropriate start point
    const today = startOfDay(new Date());
    setSelectedDate(today);

    switch (newView) {
      case "day":
        setCurrentDate(today);
        break;
      case "week":
        // Start from beginning of current week (Monday)
        setCurrentDate(startOfWeek(today, { weekStartsOn: 1 }));
        break;
      case "month":
        setCurrentDate(startOfMonth(today));
        break;
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

  const handleTripApply = useCallback((start: string, end: string) => {
    setTripStartDate(start);
    setTripEndDate(end);
    // Navigate to the start of the trip
    const tripStart = parseISO(start);
    setCurrentDate(startOfMonth(tripStart));
    setSelectedDate(tripStart);
  }, []);

  const handleTripClear = useCallback(() => {
    setTripStartDate(null);
    setTripEndDate(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Calendar header with view switcher and filter */}
      <CalendarHeader
        view={view}
        currentDate={view === "month" ? startOfMonth(currentDate) : currentDate}
        selectedTag={selectedTag}
        onViewChange={handleViewChange}
        onDateChange={handleDateChange}
        onToday={handleToday}
        onTagChange={handleTagChange}
      />

      {/* Trip planner */}
      <div className="border-b bg-background">
        <TripPlanner
          startDate={tripStartDate}
          endDate={tripEndDate}
          onApply={handleTripApply}
          onClear={handleTripClear}
          eventCount={tripEventCount}
        />
      </div>

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
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
            />
          )}
        </div>
      </div>
    </div>
  );
}