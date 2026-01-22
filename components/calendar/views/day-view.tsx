"use client";

import { useMemo } from "react";
import {
  isToday,
  isBefore,
  startOfDay,
  format,
  getHours,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Calendar as CalendarIcon, Sunrise, Sun, Sunset, Moon } from "lucide-react";
import type { Event } from "@/lib/types";
import { DALAT_TIMEZONE } from "@/lib/timezone";
import { EventCardFull } from "../event-cards/event-card-full";
import { cn } from "@/lib/utils";

interface DayViewProps {
  events: Event[];
  eventsByDate: Record<string, Event[]>;
  currentDate: Date;
}

// Time periods for grouping events
const TIME_PERIODS = [
  { key: "morning", label: "Morning", icon: Sunrise, start: 6, end: 12 },
  { key: "afternoon", label: "Afternoon", icon: Sun, start: 12, end: 17 },
  { key: "evening", label: "Evening", icon: Sunset, start: 17, end: 21 },
  { key: "night", label: "Night", icon: Moon, start: 21, end: 6 },
] as const;

function getTimePeriod(hour: number): typeof TIME_PERIODS[number]["key"] {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function DayView({
  events,
  eventsByDate,
  currentDate,
}: DayViewProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const isPastDay = isBefore(startOfDay(currentDate), today);
  const isTodayDate = isToday(currentDate);

  // Get events for the current date
  const dateKey = format(currentDate, "yyyy-MM-dd");
  const dayEvents = eventsByDate[dateKey] || [];

  // Group events by time period
  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };

    dayEvents.forEach(event => {
      // Parse the event start time in Da Lat timezone
      const eventDate = toZonedTime(new Date(event.starts_at), DALAT_TIMEZONE);
      const hour = getHours(eventDate);
      const period = getTimePeriod(hour);
      groups[period].push(event);
    });

    // Sort events within each group by start time
    Object.keys(groups).forEach(period => {
      groups[period].sort((a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );
    });

    return groups;
  }, [dayEvents]);

  // Check if any period has events
  const hasAnyEvents = dayEvents.length > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 space-y-6">
        {/* Day header with context */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarIcon className="w-4 h-4" />
          <span>
            {isTodayDate ? (
              <span className="text-foreground font-medium">Today</span>
            ) : isPastDay ? (
              <span className="text-yellow-600 dark:text-yellow-500">Past date</span>
            ) : (
              format(currentDate, "EEEE")
            )}
          </span>
          {dayEvents.length > 0 && (
            <>
              <span>·</span>
              <span>{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>

        {/* Empty state */}
        {!hasAnyEvents && (
          <div className="text-center py-16">
            <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {isPastDay
                ? "No events were scheduled for this day"
                : "No events scheduled for this day"}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {isPastDay
                ? "Browse upcoming days to find events"
                : "Check back later or browse other days"}
            </p>
          </div>
        )}

        {/* Time period groups */}
        {hasAnyEvents && TIME_PERIODS.map(period => {
          const periodEvents = groupedEvents[period.key];
          if (periodEvents.length === 0) return null;

          const Icon = period.icon;

          return (
            <div key={period.key}>
              {/* Period header */}
              <div className="flex items-center gap-2 mb-3">
                <Icon className={cn(
                  "w-4 h-4",
                  period.key === "morning" && "text-amber-500",
                  period.key === "afternoon" && "text-yellow-500",
                  period.key === "evening" && "text-orange-500",
                  period.key === "night" && "text-indigo-400"
                )} />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {period.label}
                </h3>
                <span className="text-xs text-muted-foreground/70">
                  {periodEvents.length} event{periodEvents.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Events list */}
              <div className="space-y-3 pl-6 border-l-2 border-muted">
                {periodEvents.map(event => (
                  <div key={event.id} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -left-[25px] top-5 w-2 h-2 rounded-full bg-green-500" />
                    <EventCardFull event={event} isPast={isPastDay} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
