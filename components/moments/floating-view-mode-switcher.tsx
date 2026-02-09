"use client";

import { Film, Layers, Grid3X3, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import type { MomentsViewMode } from "@/lib/hooks/use-moments-view-mode";

interface FloatingViewModeSwitcherProps {
  viewMode: MomentsViewMode;
  onViewModeChange: (mode: MomentsViewMode) => void;
  onClose: () => void;
}

const modes = [
  { mode: "cinema" as const, icon: Film, label: "Cinema" },
  { mode: "immersive" as const, icon: Layers, label: "Immersive" },
  { mode: "grid" as const, icon: Grid3X3, label: "Grid" },
];

/**
 * Always-visible floating view mode switcher for fullscreen views (cinema/immersive).
 * Rendered at z-60, above all overlays, so it never auto-hides.
 */
export function FloatingViewModeSwitcher({
  viewMode,
  onViewModeChange,
  onClose,
}: FloatingViewModeSwitcherProps) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex items-center gap-1.5 pointer-events-auto">
      <div className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-md p-1">
        {modes.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onViewModeChange(mode);
            }}
            className={cn(
              "p-2 rounded-full transition-all",
              viewMode === mode
                ? "bg-white/20 text-white"
                : "text-white/50 hover:text-white hover:bg-white/10"
            )}
            aria-label={`Switch to ${label} view`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("selection");
          onClose();
        }}
        className="p-2 rounded-full bg-black/50 backdrop-blur-md text-white/50 hover:text-white hover:bg-black/70 transition-all"
        aria-label="Exit to grid"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
