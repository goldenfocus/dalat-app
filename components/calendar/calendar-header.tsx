"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatCalendarDate } from "@/lib/calendar";
import { addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ViewSwitcher, type CalendarView } from "./view-switcher";
import { TagFilterBar } from "@/components/events/tag-filter-bar";
import type { EventTag } from "@/lib/constants/event-tags";

interface CalendarHeaderProps {
  view: CalendarView;
  currentDate: Date;
  selectedDate: Date;
  selectedTag: EventTag | null;
  onViewChange: (view: CalendarView) => void;
  onDateChange: (date: Date) => void;
  onToday: () => void;
  onTagChange: (tag: EventTag | null) => void;
}

export function CalendarHeader({
  view,
  currentDate,
  selectedDate,
  selectedTag,
  onViewChange,
  onDateChange,
  onToday,
  onTagChange,
}: CalendarHeaderProps) {
  const locale = useLocale();
  const t = useTranslations("calendarView");
  const common = useTranslations("common");
  const date = (value: Date, options: Intl.DateTimeFormatOptions) => formatCalendarDate(value, locale, options);
  const handlePrevious = () => {
    triggerHaptic("selection");
    switch (view) {
      case "day":
        onDateChange(subDays(currentDate, 1));
        break;
      case "week":
        onDateChange(subWeeks(currentDate, 1));
        break;
      case "month":
        onDateChange(subMonths(currentDate, 1));
        break;
    }
  };

  const handleNext = () => {
    triggerHaptic("selection");
    switch (view) {
      case "day":
        onDateChange(addDays(currentDate, 1));
        break;
      case "week":
        onDateChange(addWeeks(currentDate, 1));
        break;
      case "month":
        onDateChange(addMonths(currentDate, 1));
        break;
    }
  };

  const handleToday = () => {
    triggerHaptic("selection");
    onToday();
  };

  const getTitle = () => {
    if (view === "day") return date(currentDate, { weekday: "short", month: "short", day: "numeric" });
    if (view === "month") return date(currentDate, { month: "long", year: "numeric" });
    return `${date(currentDate, { month: "short", day: "numeric" })} – ${date(addDays(currentDate, 6), { month: "short", day: "numeric" })}`;
  };

  return (
    <div className="border-b bg-background">
      {/* Navigation row */}
      <div className="p-4 pb-2 lg:pb-4">
        <div className="flex items-center justify-between gap-1 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              onClick={handlePrevious}
              className="shrink-0 p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label={common("previous")}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 suppressHydrationWarning className="min-w-0 flex-1 truncate text-sm sm:text-lg font-semibold text-center whitespace-nowrap">
              {getTitle()}
            </h2>
            <button
              onClick={handleNext}
              className="shrink-0 p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label={common("next")}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop: view switcher inline */}
          <div className="hidden lg:block">
            <ViewSwitcher value={view} onChange={onViewChange} currentDate={currentDate} selectedDate={selectedDate} />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <TagFilterBar selectedTag={selectedTag} onTagChange={onTagChange} />
            <button
              onClick={handleToday}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors active:scale-95"
            >
              {t("today")}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: view switcher row */}
      <div className="px-4 pb-4 lg:hidden">
        <ViewSwitcher value={view} onChange={onViewChange} currentDate={currentDate} selectedDate={selectedDate} />
      </div>
    </div>
  );
}
