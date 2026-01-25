"use client";

import { useState, useEffect } from "react";
import { SlidersHorizontal, LayoutGrid, Grid3X3, List, Maximize2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  useEventViewPreferences,
  type EventViewMode,
  type EventDensity,
} from "@/lib/hooks/use-local-storage";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Combined view options - Grid+ is grid with spacious density
type ViewOption = {
  id: string;
  mode: EventViewMode;
  density?: EventDensity; // Only set for grid variants
  icon: typeof LayoutGrid;
  labelKey: string;
  desktopOnly?: boolean; // Hide on mobile where it doesn't make a difference
};

const VIEW_OPTIONS: ViewOption[] = [
  { id: "grid", mode: "grid", density: "default", icon: Grid3X3, labelKey: "grid" },
  { id: "grid-plus", mode: "grid", density: "spacious", icon: LayoutGrid, labelKey: "gridPlus", desktopOnly: true },
  { id: "list", mode: "list", icon: List, labelKey: "list" },
  { id: "immersive", mode: "immersive", icon: Maximize2, labelKey: "immersive" },
];

interface EventViewToggleProps {
  className?: string;
}

/**
 * Compact view settings button with dropdown.
 * Single filter icon that reveals view options.
 * Grid variants (Grid, Grid+) have density baked in for simplicity.
 */
export function EventViewToggle({ className }: EventViewToggleProps) {
  const t = useTranslations("viewToggle");
  const { mode, density, setPreferences } = useEventViewPreferences();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Check if we're on desktop (lg breakpoint = 1024px)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Filter options - hide desktopOnly options on mobile
  const visibleOptions = VIEW_OPTIONS.filter(
    (option) => !option.desktopOnly || isDesktop
  );

  // Determine which option is currently active
  const getActiveOptionId = () => {
    if (mode === "grid") {
      // On mobile, Grid+ isn't shown, so treat spacious as regular grid
      if (density === "spacious" && !isDesktop) return "grid";
      return density === "spacious" ? "grid-plus" : "grid";
    }
    return mode;
  };

  const activeOptionId = getActiveOptionId();

  const handleOptionSelect = (option: ViewOption) => {
    setPreferences({
      mode: option.mode,
      density: option.density ?? "default",
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            "active:scale-95",
            className
          )}
          aria-label={t("viewSettings")}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <div role="group" aria-labelledby="view-mode-label">
          <p id="view-mode-label" className="text-xs font-medium text-muted-foreground px-2 mb-1">
            {t("viewMode")}
          </p>
          {visibleOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activeOptionId === option.id;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleOptionSelect(option)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                  "transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="flex-1 text-left">{t(option.labelKey)}</span>
                {isActive && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
