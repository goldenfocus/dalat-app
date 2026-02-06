"use client";

import { X, Pause, Play, Grid3X3, Layers } from "lucide-react";
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
  // Use individual selectors to avoid re-rendering on every timer tick
  const progress = useCinemaProgressValue();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();
  const playbackState = useCinemaPlaybackState();
  const showControls = useCinemaShowControls();

  // Get actions directly from store (stable references, won't cause re-renders)
  const togglePlayback = useCinemaModeStore.getState().togglePlayback;
  const goTo = useCinemaModeStore.getState().goTo;
  const showControlsTemporarily = useCinemaModeStore.getState().showControlsTemporarily;

  const isPaused = playbackState === "paused";
  const isEnded = playbackState === "ended";

  const handleTogglePlayback = () => {
    triggerHaptic("selection");
    togglePlayback();
  };

  const handleSegmentClick = (index: number) => {
    triggerHaptic("selection");
    goTo(index);
  };

  const handleExit = () => {
    triggerHaptic("selection");
    onExit();
  };

  const handleSwitchToGrid = () => {
    triggerHaptic("selection");
    onExit();
    onSwitchToGrid?.();
  };

  const handleSwitchToImmersive = () => {
    triggerHaptic("selection");
    onExit();
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
        showControls ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-auto">
        {/* Counter */}
        <div
          className={cn(
            "text-white/80 text-sm font-medium px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm",
            "transition-opacity duration-500",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
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

      {/* Center play/pause button */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
        <button
          onClick={handleTogglePlayback}
          className={cn(
            "p-4 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 transition-all",
            "opacity-30 hover:opacity-100",
            (isPaused || isEnded) && "opacity-100"
          )}
          aria-label={isPaused ? "Play" : "Pause"}
        >
          {isPaused || isEnded ? (
            <Play className="w-8 h-8" />
          ) : (
            <Pause className="w-8 h-8" />
          )}
        </button>
      </div>

      {/* Bottom timeline */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe pointer-events-auto">
        {/* Segmented progress bar */}
        <div className="flex gap-0.5 h-1 rounded-full overflow-hidden">
          {segments.map((segment) => (
            <button
              key={segment.index}
              onClick={() => handleSegmentClick(segment.index)}
              className={cn(
                "relative flex-1 h-full rounded-full overflow-hidden transition-colors",
                segment.isUpcoming && "bg-white/20",
                segment.isCompleted && "bg-primary",
                segment.isCurrent && "bg-white/20"
              )}
              aria-label={`Go to moment ${segment.index + 1}`}
            >
              {/* Current segment fill animation */}
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
