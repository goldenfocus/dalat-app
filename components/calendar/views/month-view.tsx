"use client";

import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  isSameMonth,
  isSameDay,
  isBefore,
  startOfDay,
  endOfDay,
  format,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { Calendar as CalendarIcon, CalendarDays, LayoutGrid, List } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCalendarDate, parseCalendarDate, todayInDaLat, type CalendarEvent } from "@/lib/calendar";
import { CalendarEventCard } from "../event-cards/event-card-compact";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type MonthMode = "calendar" | "rolling" | "list";

interface MonthViewProps {
  events: CalendarEvent[];
  eventsByDate: Record<string, CalendarEvent[]>;
  currentMonth: Date;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}

export function MonthView({
  events: _events,
  eventsByDate,
  currentMonth,
  selectedDate,
  onDateSelect,
  tripStartDate,
  tripEndDate,
}: MonthViewProps) {
  const locale = useLocale();
  const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => formatCalendarDate(date, locale, options);
  const tripModeActive = !!(tripStartDate && tripEndDate);
  const t = useTranslations("calendarView");
  // Default to "rolling" (Next 30 Days) for event discovery
  const [mode, setMode] = useState<MonthMode>("rolling");
  const today = parseCalendarDate(todayInDaLat())!;

  // Get calendar days grid based on mode
  const calendarDays = useMemo(() => {
    if (mode === "rolling" || mode === "list") {
      // Rolling month follows the selected date and the header arrows.
      return Array.from({ length: 30 }, (_, i) => addDays(currentMonth, i));
    }

    // Traditional calendar view
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth, mode]);

  // Get upcoming events for list view (sorted by date)
  const upcomingEvents = useMemo(() => {
    if (mode !== "list") return [];

    // Get all events in the displayed 30 days
    const upcoming: { date: Date; events: CalendarEvent[] }[] = [];

    calendarDays.forEach(day => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayEvents = eventsByDate[dateKey] || [];
      if (dayEvents.length > 0) {
        upcoming.push({ date: day, events: dayEvents });
      }
    });

    return upcoming;
  }, [mode, calendarDays, eventsByDate]);

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

  const handleModeToggle = (newMode: MonthMode) => {
    triggerHaptic("selection");
    setMode(newMode);
  };

  // Check if a date is within the trip range
  const isInTripRange = (date: Date) => {
    if (!tripStartDate || !tripEndDate) return false;
    return isWithinInterval(date, { start: startOfDay(parseISO(tripStartDate)), end: endOfDay(parseISO(tripEndDate)) });
  };

  // Get day headers based on mode
  const dayHeaders = useMemo(() => {
    const days = [
      t("days.sun"), t("days.mon"), t("days.tue"), t("days.wed"),
      t("days.thu"), t("days.fri"), t("days.sat")
    ];
    if (mode === "rolling") {
      // Rolling headers follow the displayed start date
      const todayDayOfWeek = currentMonth.getDay();
      return Array.from({ length: 7 }, (_, i) => days[(todayDayOfWeek + i) % 7]);
    }
    return days;
  }, [mode, currentMonth, t]);

  return (
    <div className="h-full flex flex-col">
      {/* Mode toggle */}
      <div className="px-4 pt-3 pb-1 flex justify-end">
        <div className="inline-flex bg-muted rounded-md p-0.5">
          <button
            onClick={() => handleModeToggle("rolling")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 lg:px-2 lg:py-0.5 text-xs font-medium rounded transition-all",
              mode === "rolling"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="w-3 h-3" />
            <span className="hidden sm:inline">{t("modes.thirtyDays")}</span>
            <span className="sm:hidden">30d</span>
          </button>
          <button
            onClick={() => handleModeToggle("list")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 lg:px-2 lg:py-0.5 text-xs font-medium rounded transition-all",
              mode === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="w-3 h-3" />
            {t("modes.list")}
          </button>
          <button
            onClick={() => handleModeToggle("calendar")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 lg:px-2 lg:py-0.5 text-xs font-medium rounded transition-all",
              mode === "calendar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="w-3 h-3" />
            <span className="hidden sm:inline">{t("modes.calendar")}</span>
            <span className="sm:hidden">Cal</span>
          </button>
        </div>
      </div>

      {/* List view */}
      {mode === "list" && (
        <div className="flex-1 overflow-auto p-4 pt-2">
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-16">
              <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("noUpcomingEvents")}</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {t("checkBackLater")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingEvents.map(({ date, events: dayEvents }) => (
                <div key={format(date, "yyyy-MM-dd")}>
                  {/* Date header */}
                  <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1">
                    <div className={cn(
                      "text-sm font-semibold",
                      format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd") && "text-primary"
                    )}>
                      {format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd") ? t("today") : dateLabel(date, { weekday: "long", month: "short", day: "numeric" })}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {dayEvents.length === 1 ? t("eventCount", { count: 1 }) : t("eventsCount", { count: dayEvents.length })}
                    </span>
                  </div>

                  {/* Events for this date */}
                  <div className="space-y-2">
                    {dayEvents.map(event => (
                      <CalendarEventCard key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid views (calendar and rolling) */}
      {mode !== "list" && (
        <>
          <div className="flex-1 overflow-auto p-4 pt-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {dayHeaders.map((day, index) => (
                <div
                  key={`${day}-${index}`}
                  className="text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDate[dateKey] || [];
                const hasEvents = dayEvents.length > 0;
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = mode === "rolling" || isSameMonth(day, currentMonth);
                const isTodayDate = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                const isPast = isBefore(startOfDay(day), today);
                const inTripRange = isInTripRange(day);

                return (
                  <button
                    key={`${dateKey}-${index}`}
                    data-calendar-date={dateKey}
                    aria-label={dateLabel(day, { dateStyle: "full" })}
                    onClick={() => handleDateClick(day)}
                    className={cn(
                      "relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all",
                      "hover:bg-muted active:scale-95",
                      !isCurrentMonth && "text-muted-foreground/40",
                      // Past day dimming (40% opacity) - only in calendar mode
                      isPast && isCurrentMonth && !isSelected && mode === "calendar" && "opacity-40",
                      // Trip range highlight (subtle background)
                      inTripRange && !isSelected && "bg-foreground/10",
                      isSelected && "bg-foreground text-background hover:bg-foreground opacity-100",
                      isTodayDate && !isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    {/* Show month indicator on first day of each month in rolling mode */}
                    {mode === "rolling" && format(day, "d") === "1" && (
                      <span className="absolute -top-0.5 text-[8px] font-medium text-muted-foreground">
                        {dateLabel(day, { month: "short" })}
                      </span>
                    )}

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

          {/* Selected date events - hidden when trip mode is active */}
          {selectedDate && !tripModeActive && (
            <div className="border-t bg-background max-h-[40vh] overflow-auto">
              <div className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  <span suppressHydrationWarning>{dateLabel(selectedDate, { dateStyle: "full" })}</span>
                </h3>

                {selectedDateEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t("noEventsOnThisDay")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateEvents.map(event => (
                      <CalendarEventCard key={event.id} event={event} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
