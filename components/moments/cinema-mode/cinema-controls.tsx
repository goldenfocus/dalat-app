"use client";

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
}

export function CinemaControls({
  onExit,
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
      {/* Top bar — counter only (view mode switcher is a separate persistent component) */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto">
        <div className="text-white/80 text-sm font-medium px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm w-fit">
          {currentIndex + 1} / {total}
        </div>
      </div>

      {/* Bottom timeline — tall touch target, thin visual bar */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-safe pointer-events-auto">
        <div className="flex gap-0.5 items-end">
          {segments.map((segment) => (
            <button
              key={segment.index}
              onClick={(e) => {
                e.stopPropagation();
                handleSegmentClick(segment.index);
              }}
              className="relative flex-1 py-4 group"
              aria-label={`Go to moment ${segment.index + 1}`}
            >
              {/* Visual bar (thin) */}
              <div
                className={cn(
                  "relative h-1 rounded-full overflow-hidden transition-colors",
                  segment.isUpcoming && "bg-white/20",
                  segment.isCompleted && "bg-primary",
                  segment.isCurrent && "bg-white/20"
                )}
              >
                {segment.isCurrent && (
                  <div
                    className="absolute inset-0 bg-primary origin-left transition-transform"
                    style={{
                      transform: `scaleX(${progress / 100})`,
                    }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
