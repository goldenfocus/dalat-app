"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { CalendarView } from "@/lib/calendar";
export type { CalendarView } from "@/lib/calendar";

import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";


interface ViewSwitcherProps {
  value: CalendarView;
  onChange: (view: CalendarView) => void;
  currentDate: Date;
  selectedDate: Date;
}

const views: CalendarView[] = ["day", "week", "month"];

export function ViewSwitcher({ value, onChange, currentDate, selectedDate }: ViewSwitcherProps) {
  const t = useTranslations("calendarView");
  const searchParams = useSearchParams();
  const handleChange = (view: CalendarView) => {
    if (view !== value) {
      triggerHaptic("selection");
      onChange(view);
    }
  };

  return (
    <div
      className="inline-flex w-full lg:w-auto bg-muted rounded-lg p-1 lg:p-0.5"
      role="tablist"
      aria-label={t("view")}
    >
      {views.map(view => {
        const isSelected = value === view;
        const params = new URLSearchParams(searchParams?.toString());
        params.set("view", view);
        params.set("date", format(view === "day" ? selectedDate : currentDate, "yyyy-MM-dd"));

        return (
          <a
            key={view}
            href={`?${params.toString()}`}
            role="tab"
            aria-selected={isSelected}
            onClick={(event) => {
              // Before hydration this is a working native link. After it,
              // re-use the loaded data for an instant view change.
              event.preventDefault();
              handleChange(view);
            }}
            className={cn(
              // Mobile: full-width with touch-friendly height
              "flex-1 h-11 flex items-center justify-center",
              // Desktop: compact inline buttons
              "lg:flex-none lg:h-8 lg:px-3",
              "text-sm font-medium rounded-md transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "active:scale-[0.98]",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {t(`views.${view}`)}
          </a>
        );
      })}
    </div>
  );
}
