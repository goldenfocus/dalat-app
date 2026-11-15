"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { format, isWithinInterval, endOfDay } from "date-fns";
import type { EventTag } from "@/lib/constants/event-tags";
import { formatInDaLat } from "@/lib/timezone";
import { parseCalendarDate, readCalendarState, todayInDaLat, type CalendarEvent, type CalendarView } from "@/lib/calendar";
import { CalendarHeader } from "./calendar-header";
import { TripPlanner } from "./trip-planner";
import { DayView } from "./views/day-view";
import { WeekView } from "./views/week-view";
import { MonthView } from "./views/month-view";

interface EventCalendarProps {
  events: CalendarEvent[];
  initialToday: string;
}

export function EventCalendar({ events, initialToday }: EventCalendarProps) {
  const searchParams = useSearchParams();
  const [calendar, setCalendar] = useState(() => readCalendarState(new URLSearchParams(searchParams?.toString()), initialToday));
  const [selectedTag, setSelectedTag] = useState<EventTag | null>(null);
  const { view, date: currentDate, selectedDate, tripStartDate, tripEndDate } = calendar;

  // View/date changes re-use loaded events. Router navigation used to re-run
  // server queries and repeatedly shift date-only values west of UTC.
  const updateCalendar = useCallback((next: typeof calendar) => {
    setCalendar(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next.view);
    url.searchParams.set("date", format(next.date, "yyyy-MM-dd"));
    for (const [key, value] of [["from", next.tripStartDate], ["to", next.tripEndDate]] as const) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const restore = () => setCalendar(readCalendarState(new URLSearchParams(window.location.search), todayInDaLat()));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const filteredEvents = useMemo(() => events.filter(event => {
    if (selectedTag && !event.ai_tags?.includes(selectedTag)) return false;
    if (tripStartDate && tripEndDate) {
      const day = parseCalendarDate(formatInDaLat(event.starts_at, "yyyy-MM-dd"))!;
      return isWithinInterval(day, { start: parseCalendarDate(tripStartDate)!, end: endOfDay(parseCalendarDate(tripEndDate)!) });
    }
    return true;
  }), [events, selectedTag, tripStartDate, tripEndDate]);

  const tripEventCount = useMemo(() => {
    if (!tripStartDate || !tripEndDate) return 0;
    return events.filter(event => {
      const day = formatInDaLat(event.starts_at, "yyyy-MM-dd");
      return day >= tripStartDate && day <= tripEndDate;
    }).length;
  }, [events, tripStartDate, tripEndDate]);

  const eventsByDate = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    for (const event of filteredEvents) {
      const key = formatInDaLat(event.starts_at, "yyyy-MM-dd");
      (groups[key] ??= []).push(event);
    }
    for (const group of Object.values(groups)) group.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return groups;
  }, [filteredEvents]);

  const handleViewChange = (newView: CalendarView) => updateCalendar({
    ...calendar,
    view: newView,
    date: newView === "day" ? calendar.selectedDate : calendar.date,
  });
  const handleDateChange = (date: Date) => updateCalendar({ ...calendar, date, selectedDate: date });
  const handleToday = () => handleDateChange(parseCalendarDate(todayInDaLat())!);
  const handleDateSelect = (date: Date) => setCalendar({ ...calendar, selectedDate: date });
  const handleTripApply = (start: string, end: string) => {
    const date = parseCalendarDate(start);
    if (!date || !parseCalendarDate(end) || end < start) return;
    updateCalendar({ ...calendar, date, selectedDate: date, tripStartDate: start, tripEndDate: end });
  };

  return (
    <div className="h-full flex flex-col" data-calendar>
      <CalendarHeader view={view} currentDate={currentDate} selectedDate={selectedDate} selectedTag={selectedTag} onViewChange={handleViewChange} onDateChange={handleDateChange} onToday={handleToday} onTagChange={setSelectedTag} />
      <div className="border-b bg-background">
        <TripPlanner startDate={tripStartDate} endDate={tripEndDate} onApply={handleTripApply} onClear={() => updateCalendar({ ...calendar, tripStartDate: null, tripEndDate: null })} eventCount={tripEventCount} />
      </div>
      <div className="flex-1 min-h-0 relative">
        <div key={view} className="h-full animate-in fade-in duration-200">
          {view === "day" && <DayView events={filteredEvents} eventsByDate={eventsByDate} currentDate={currentDate} />}
          {view === "week" && <WeekView events={filteredEvents} eventsByDate={eventsByDate} startDate={currentDate} selectedDate={selectedDate} onDateSelect={handleDateSelect} />}
          {view === "month" && <MonthView events={filteredEvents} eventsByDate={eventsByDate} currentMonth={currentDate} selectedDate={selectedDate} onDateSelect={handleDateSelect} tripStartDate={tripStartDate} tripEndDate={tripEndDate} />}
        </div>
      </div>
    </div>
  );
}
