"use client";

import { useTranslations } from "next-intl";
import { Grid3X3, Smartphone, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MomentsViewMode } from "@/lib/hooks/use-moments-view-mode";

interface ViewModeSwitcherProps {
  viewMode: MomentsViewMode;
  onViewModeChange: (mode: MomentsViewMode) => void;
  className?: string;
}

/**
 * Toggle button group to switch between grid, immersive, and cinema view modes.
 */
export function ViewModeSwitcher({
  viewMode,
  onViewModeChange,
  className,
}: ViewModeSwitcherProps) {
  const t = useTranslations("moments");
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-muted p-1 gap-1",
        className,
      )}
      role="radiogroup"
      aria-label={t("viewModeLabel")}
    >
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === "grid"}
        aria-label={t("viewGrid")}
        onClick={() => onViewModeChange("grid")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          viewMode === "grid"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Grid3X3 className="w-4 h-4" />
        <span className="hidden sm:inline">{t("viewGrid")}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === "immersive"}
        aria-label={t("viewImmersive")}
        onClick={() => onViewModeChange("immersive")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          viewMode === "immersive"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Smartphone className="w-4 h-4" />
        <span className="hidden sm:inline">{t("viewImmersive")}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === "cinema"}
        aria-label={t("viewCinema")}
        onClick={() => onViewModeChange("cinema")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          viewMode === "cinema"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Film className="w-4 h-4" />
        <span className="hidden sm:inline">{t("viewCinema")}</span>
      </button>
    </div>
  );
}
