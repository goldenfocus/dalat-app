"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface PointsEarnedToastProps {
  points: number;
  activity: string;
  onComplete?: () => void;
}

export function PointsEarnedToast({
  points,
  activity,
  onComplete,
}: PointsEarnedToastProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    // Kick off enter -> visible transition on next frame
    const enterTimer = requestAnimationFrame(() => setPhase("visible"));

    // Start exit after 2.5s
    const exitTimer = setTimeout(() => setPhase("exit"), 2500);

    // Call onComplete after full 3s
    const doneTimer = setTimeout(() => onComplete?.(), 3000);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-4",
        "transition-all duration-500 ease-out",
        phase === "enter" && "-translate-y-full opacity-0",
        phase === "visible" && "translate-y-0 opacity-100",
        phase === "exit" && "-translate-y-2 opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2.5 rounded-full",
          "border border-amber-500/20 bg-amber-500/10 px-4 py-2.5",
          "shadow-lg shadow-amber-500/10 backdrop-blur-sm",
        )}
      >
        <span className="relative flex shrink-0 items-center justify-center">
          <Sparkles className="h-4 w-4 text-amber-500" />
          {/* Sparkle pulse ring */}
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        </span>

        <span className="text-sm font-bold tabular-nums text-amber-500">
          +{points} pts
        </span>

        <span className="text-xs text-muted-foreground">{activity}</span>
      </div>
    </div>
  );
}
