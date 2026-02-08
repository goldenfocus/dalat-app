"use client";

import { X, Grid3X3, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import {
  useCinemaModeStore,
  useCinemaProgressValue,
  useCinemaCurrentIndex,
  useCinemaTotalCount,
  useCinemaPlaybackState,
  useCinemaShowControls,
} from "@/lib/stores/cinema-mode-store";

interface CinemaControlsProps {
  onExit: () => void;
  onSwitchToGrid?: () => void;
  onSwitchToImmersive?: () => void;
}

export function CinemaControls({
  onExit,
  onSwitchToGrid,
  onSwitchToImmersive,
}: CinemaControlsProps) {
  const progress = useCinemaProgressValue();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();
  const playbackState = useCinemaPlaybackState();
  const showControls = useCinemaShowControls();

  const goTo = useCinemaModeStore.getState().goTo;

  const isPaused = playbackState === "paused";

  const handleSegmentClick = (index: number) => {
    triggerHaptic("selection");
    goTo(index);
  };

  const handleExit = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("selection");
    onExit();
  };

  const handleSwitchToGrid = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("selection");
    onSwitchToGrid?.();
  };

  const handleSwitchToImmersive = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("selection");
    onSwitchToImmersive?.();
  };

  // Generate timeline segments
  const segments = Array.from({ length: total }, (_, i) => ({
    index: i,
    isCompleted: i < currentIndex,
    isCurrent: i === currentIndex,
    isUpcoming: i > currentIndex,
  }));

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 pointer-events-none transition-opacity duration-300",
        (showControls || isPaused) ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-auto">
        {/* Counter */}
        <div className="text-white/80 text-sm font-medium px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm">
          {currentIndex + 1} / {total}
        </div>

        {/* Top right controls */}
        <div className="flex items-center gap-2">
          {onSwitchToImmersive && (
            <button
              onClick={handleSwitchToImmersive}
              className="p-2 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 transition-all"
              aria-label="Switch to immersive view"
            >
              <Layers className="w-5 h-5" />
            </button>
          )}
          {onSwitchToGrid && (
            <button
              onClick={handleSwitchToGrid}
              className="p-2 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 transition-all"
              aria-label="Switch to grid view"
            >
              <Grid3X3 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleExit}
            className="p-2 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 transition-all"
            aria-label="Exit cinema mode"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom timeline */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe pointer-events-auto">
        {/* Segmented progress bar */}
        <div className="flex gap-0.5 h-1 rounded-full overflow-hidden">
          {segments.map((segment) => (
            <button
              key={segment.index}
              onClick={(e) => {
                e.stopPropagation();
                handleSegmentClick(segment.index);
              }}
              className={cn(
                "relative flex-1 h-full rounded-full overflow-hidden transition-colors",
                segment.isUpcoming && "bg-white/20",
                segment.isCompleted && "bg-primary",
                segment.isCurrent && "bg-white/20"
              )}
              aria-label={`Go to moment ${segment.index + 1}`}
            >
              {segment.isCurrent && (
                <div
                  className="absolute inset-0 bg-primary origin-left transition-transform"
                  style={{
                    transform: `scaleX(${progress / 100})`,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
