"use client";

import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ViewSwitcher, type CalendarView } from "./view-switcher";
import { TagFilterBar } from "@/components/events/tag-filter-bar";
import type { EventTag } from "@/lib/constants/event-tags";

interface CalendarHeaderProps {
  view: CalendarView;
  currentDate: Date;
  selectedTag: EventTag | null;
  onViewChange: (view: CalendarView) => void;
  onDateChange: (date: Date) => void;
  onToday: () => void;
  onTagChange: (tag: EventTag | null) => void;
}

export function CalendarHeader({
  view,
  currentDate,
  selectedTag,
  onViewChange,
  onDateChange,
  onToday,
  onTagChange,
}: CalendarHeaderProps) {
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

  // Format title based on view
  const getTitle = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEE, MMM d, yyyy");
      case "week":
        const weekEnd = addDays(currentDate, 6);
        // If week spans two months, show both
        if (format(currentDate, "MMM") !== format(weekEnd, "MMM")) {
          return `${format(currentDate, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
        }
        return `${format(currentDate, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
      case "month":
        return format(currentDate, "MMMM yyyy");
    }
  };

  return (
    <div className="border-b bg-background">
      {/* Navigation row */}
      <div className="p-4 pb-2 lg:pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label={`Previous ${view}`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold min-w-[180px] text-center">
              {getTitle()}
            </h2>
            <button
              onClick={handleNext}
              className="p-2 hover:bg-muted rounded-lg transition-colors active:scale-95"
              aria-label={`Next ${view}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop: view switcher inline */}
          <div className="hidden lg:block">
            <ViewSwitcher value={view} onChange={onViewChange} />
          </div>

          <div className="flex items-center gap-2">
            <TagFilterBar selectedTag={selectedTag} onTagChange={onTagChange} />
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-sm font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors active:scale-95"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: view switcher row */}
      <div className="px-4 pb-4 lg:hidden">
        <ViewSwitcher value={view} onChange={onViewChange} />
      </div>
    </div>
  );
}
