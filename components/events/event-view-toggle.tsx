"use client";

import { useState } from "react";
import { SlidersHorizontal, LayoutGrid, List, Maximize2, Check } from "lucide-react";
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

const VIEW_MODES: { mode: EventViewMode; icon: typeof LayoutGrid; labelKey: string }[] = [
  { mode: "grid", icon: LayoutGrid, labelKey: "grid" },
  { mode: "list", icon: List, labelKey: "list" },
  { mode: "immersive", icon: Maximize2, labelKey: "immersive" },
];

const DENSITY_OPTIONS: { density: EventDensity; labelKey: string }[] = [
  { density: "compact", labelKey: "compact" },
  { density: "default", labelKey: "default" },
  { density: "spacious", labelKey: "spacious" },
];

interface EventViewToggleProps {
  className?: string;
}

/**
 * Compact view settings button with dropdown.
 * Single filter icon that reveals view mode and density options.
 */
export function EventViewToggle({ className }: EventViewToggleProps) {
  const t = useTranslations("viewToggle");
  const { mode, density, setMode, setDensity } = useEventViewPreferences();
  const [open, setOpen] = useState(false);

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
        {/* View Mode Section */}
        <div className="mb-2" role="group" aria-labelledby="view-mode-label">
          <p id="view-mode-label" className="text-xs font-medium text-muted-foreground px-2 mb-1">
            {t("viewMode")}
          </p>
          {VIEW_MODES.map(({ mode: m, icon: Icon, labelKey }) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                "transition-colors",
                mode === m
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="flex-1 text-left">{t(labelKey)}</span>
              {mode === m && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {/* Density Section */}
        <div className="border-t border-border pt-2" role="group" aria-labelledby="density-label">
          <p id="density-label" className="text-xs font-medium text-muted-foreground px-2 mb-1">
            {t("density")}
          </p>
          {DENSITY_OPTIONS.map(({ density: d, labelKey }) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              onClick={() => {
                setDensity(d);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                "transition-colors",
                density === d
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span className="flex-1 text-left">{t(labelKey)}</span>
              {density === d && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
