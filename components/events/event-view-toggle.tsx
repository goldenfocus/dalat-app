"use client";

import { LayoutGrid, List, Maximize2, Minus, Square, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  useEventViewPreferences,
  type EventViewMode,
  type EventDensity,
} from "@/lib/hooks/use-local-storage";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const VIEW_MODES: { mode: EventViewMode; icon: typeof LayoutGrid }[] = [
  { mode: "grid", icon: LayoutGrid },
  { mode: "list", icon: List },
  { mode: "immersive", icon: Maximize2 },
];

const DENSITY_OPTIONS: { density: EventDensity; icon: typeof Square }[] = [
  { density: "compact", icon: Minus },
  { density: "default", icon: Square },
  { density: "spacious", icon: Plus },
];

interface EventViewToggleProps {
  className?: string;
  /** Hide density toggle on mobile */
  hideDensityOnMobile?: boolean;
}

/**
 * Discrete view toggle for power users.
 * Small icon buttons to switch between grid/list/immersive views
 * and adjust density (compact/default/spacious).
 */
export function EventViewToggle({
  className,
  hideDensityOnMobile = true,
}: EventViewToggleProps) {
  const t = useTranslations("viewToggle");
  const { mode, density, setMode, setDensity } = useEventViewPreferences();

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex items-center gap-1", className)}>
        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border/50 bg-muted/30">
          {VIEW_MODES.map(({ mode: m, icon: Icon }) => (
            <Tooltip key={m}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "p-1.5 transition-colors",
                    "hover:bg-muted hover:text-foreground",
                    "active:scale-95",
                    "first:rounded-l-md last:rounded-r-md",
                    mode === m
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  )}
                  aria-label={t(m)}
                  aria-pressed={mode === m}
                >
                  <Icon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t(m)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Density toggle - hidden on mobile by default */}
        <div
          className={cn(
            "flex items-center rounded-md border border-border/50 bg-muted/30",
            hideDensityOnMobile && "hidden sm:flex"
          )}
        >
          {DENSITY_OPTIONS.map(({ density: d, icon: Icon }) => (
            <Tooltip key={d}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDensity(d)}
                  className={cn(
                    "p-1.5 transition-colors",
                    "hover:bg-muted hover:text-foreground",
                    "active:scale-95",
                    "first:rounded-l-md last:rounded-r-md",
                    density === d
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  )}
                  aria-label={t(d)}
                  aria-pressed={density === d}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t(d)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
