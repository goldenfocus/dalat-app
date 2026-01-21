"use client";

import { useState, useCallback, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import type { Event } from "@/lib/types";
import type { EventTag } from "@/lib/constants/event-tags";
import { TagFilterBar } from "@/components/events/tag-filter-bar";
import { formatInDaLat, DALAT_TIMEZONE } from "@/lib/timezone";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface EventCalendarProps {
  events: Event[];
}

export function EventCalendar({ events }: EventCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTag, setSelectedTag] = useState<EventTag | null>(null);

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

  // Get calendar days grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return eventsByDate[dateKey] || [];
  }, [selectedDate, eventsByDate]);

  const handlePreviousMonth = useCallback(() => {
    triggerHaptic("selection");
    setCurrentMonth(prev => subMonths(prev, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    triggerHaptic("selection");
    setCurrentMonth(prev => addMonths(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    triggerHaptic("selection");
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    triggerHaptic("selection");
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

      {/* Calendar header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousMonth}
              className="p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-sm font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors active:scale-95"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate[dateKey] || [];
            const hasEvents = dayEvents.length > 0;
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <button
                key={dateKey}
                onClick={() => handleDateClick(day)}
                className={cn(
                  "relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all",
                  "hover:bg-muted active:scale-95",
                  !isCurrentMonth && "text-muted-foreground/40",
                  isSelected && "bg-foreground text-background hover:bg-foreground",
                  isTodayDate && !isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <span className={cn(
                  "text-sm font-medium",
                  isSelected && "font-bold"
                )}>
                  {format(day, "d")}
                </span>

                {/* Event dots */}
                {hasEvents && (
                  <div className="absolute bottom-1 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isSelected ? "bg-background" : "bg-green-500"
                        )}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className={cn(
                        "text-[8px] font-medium",
                        isSelected ? "text-background" : "text-muted-foreground"
                      )}>
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="border-t bg-background max-h-[40vh] overflow-auto">
          <div className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </h3>

            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No events on this day
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDateEvents.map(event => (
                  <Link
                    key={event.id}
                    href={`/events/${event.slug}`}
                    className="block p-3 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <div className="flex gap-3">
                      {event.image_url && (
                        <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                          <img
                            src={event.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm line-clamp-2">
                          {event.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatInDaLat(event.starts_at, "h:mm a")}
                          {event.location_name && ` · ${event.location_name}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
