"use client";

import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type CalendarView = "day" | "week" | "month";

interface ViewSwitcherProps {
  value: CalendarView;
  onChange: (view: CalendarView) => void;
}

const views: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const handleChange = (view: CalendarView) => {
    if (view !== value) {
      triggerHaptic("selection");
      onChange(view);
    }
  };

  return (
    <div
      className="inline-flex w-full bg-muted rounded-lg p-1"
      role="tablist"
      aria-label="Calendar view"
    >
      {views.map(view => {
        const isSelected = value === view.value;

        return (
          <button
            key={view.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => handleChange(view.value)}
            className={cn(
              "flex-1 h-11 flex items-center justify-center",
              "text-sm font-medium rounded-md transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "active:scale-[0.98]",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
