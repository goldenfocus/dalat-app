"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useIsPlayerVisible } from "@/lib/stores/audio-player-store";

interface MomentCaptionOverlayProps {
  text: string;
  /**
   * scrim — gradient anchored to the image's bottom edge (lightbox); tap
   *   toggles between clamped and full text.
   * subtitle — floating film-subtitle pill (cinema mode); pointer-events-none
   *   so taps still reach the slideshow controls, and shifts up when the
   *   music mini-player (z-60, above cinema's z-50) is docked.
   */
  variant: "scrim" | "subtitle";
  className?: string;
}

export function MomentCaptionOverlay({
  text,
  variant,
  className,
}: MomentCaptionOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const playerVisible = useIsPlayerVisible();

  if (variant === "subtitle") {
    return (
      <div
        className={cn(
          "absolute left-0 right-0 z-20 px-6 text-center pointer-events-none",
          playerVisible
            ? "bottom-[calc(10rem+env(safe-area-inset-bottom))] lg:bottom-[calc(7rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
          className
        )}
      >
        <p className="inline-block max-w-2xl text-white text-sm sm:text-base bg-black/40 backdrop-blur-sm rounded-xl px-4 py-2 line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent cursor-pointer",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
    >
      {/* pb-7 keeps the watermark line visible below the caption text */}
      <p
        className={cn(
          "text-white text-sm sm:text-base text-center max-w-2xl mx-auto px-4 pt-10 pb-7",
          !expanded && "line-clamp-3"
        )}
      >
        {text}
      </p>
    </div>
  );
}
