"use client";

import { Grid3X3, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MomentsViewMode } from "@/lib/hooks/use-moments-view-mode";

interface ViewModeSwitcherProps {
  viewMode: MomentsViewMode;
  onViewModeChange: (mode: MomentsViewMode) => void;
  className?: string;
}

/**
 * Toggle button group to switch between grid and immersive view modes.
 */
export function ViewModeSwitcher({
  viewMode,
  onViewModeChange,
  className,
}: ViewModeSwitcherProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-muted p-1 gap-1",
        className
      )}
      role="radiogroup"
      aria-label="View mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === "grid"}
        onClick={() => onViewModeChange("grid")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          viewMode === "grid"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Grid3X3 className="w-4 h-4" />
        <span className="hidden sm:inline">Grid</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === "immersive"}
        onClick={() => onViewModeChange("immersive")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          viewMode === "immersive"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Smartphone className="w-4 h-4" />
        <span className="hidden sm:inline">Immersive</span>
      </button>
    </div>
  );
}
