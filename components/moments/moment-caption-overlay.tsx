"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface MomentCaptionOverlayProps {
  text: string;
  /**
   * scrim — gradient anchored to the image's bottom edge (lightbox); tap
   *   toggles between clamped and full text.
   * subtitle — floating film-subtitle pill (cinema mode); pointer-events-none
   *   so taps still reach the slideshow controls. The music player (z-60,
   *   above cinema's z-50) publishes its measured height as
   *   --docked-player-clearance; max() keeps the pill above whichever is
   *   taller — the player or the cinema timeline.
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

  if (variant === "subtitle") {
    return (
      <div
        className={cn(
          "absolute left-0 right-0 z-20 px-6 text-center pointer-events-none",
          className
        )}
        style={{
          bottom:
            "max(calc(3.5rem + env(safe-area-inset-bottom)), calc(var(--docked-player-clearance, 0px) + 0.75rem))",
        }}
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
