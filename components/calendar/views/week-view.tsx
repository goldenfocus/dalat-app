"use client";

import { useMemo } from "react";
import {
  addDays,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import type { Event } from "@/lib/types";
import { formatInDaLat } from "@/lib/timezone";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  events: Event[];
  eventsByDate: Record<string, Event[]>;
  startDate: Date;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}

export function WeekView({
  events,
  eventsByDate,
  startDate,
  selectedDate,
  onDateSelect,
}: WeekViewProps) {
  // Get 7 days starting from startDate (rolling window)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  }, [startDate]);

  // Events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return eventsByDate[dateKey] || [];
  }, [selectedDate, eventsByDate]);

  const handleDateClick = (date: Date) => {
    triggerHaptic("selection");
    onDateSelect(date);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Week grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate[dateKey] || [];
            const hasEvents = dayEvents.length > 0;
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);

            return (
              <button
                key={dateKey}
                onClick={() => handleDateClick(day)}
                className={cn(
                  "relative flex flex-col items-center rounded-lg transition-all py-3",
                  "hover:bg-muted active:scale-95",
                  isSelected && "bg-foreground text-background hover:bg-foreground",
                  isTodayDate && !isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                {/* Day abbreviation */}
                <span className={cn(
                  "text-xs font-medium mb-1",
                  isSelected ? "text-background/70" : "text-muted-foreground"
                )}>
                  {format(day, "EEE")}
                </span>

                {/* Day number */}
                <span className={cn(
                  "text-lg font-semibold",
                  isSelected && "font-bold"
                )}>
                  {format(day, "d")}
                </span>

                {/* Event dots */}
                {hasEvents && (
                  <div className="flex gap-0.5 mt-1">
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
                        "text-[8px] font-medium ml-0.5",
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

      {/* Selected date events - expands to fill remaining space */}
      <div className="flex-1 min-h-0 border-t bg-background overflow-auto">
        <div className="p-4">
          {selectedDate ? (
            <>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(selectedDate, "EEEE, MMMM d")}
              </h3>

              {selectedDateEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
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
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Select a day to see events
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
