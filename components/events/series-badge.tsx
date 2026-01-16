"use client";

import { Repeat } from "lucide-react";
import { getShortRRuleLabel } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

interface SeriesBadgeProps {
  rrule: string;
  variant?: "default" | "overlay";
  className?: string;
}

/**
 * Badge showing recurrence pattern for events in a series.
 * Uses getShortRRuleLabel for human-readable text like "Weekly on Tuesday".
 *
 * @param rrule - RFC 5545 recurrence rule string
 * @param variant - "default" for normal backgrounds, "overlay" for use on images
 */
export function SeriesBadge({
  rrule,
  variant = "default",
  className,
}: SeriesBadgeProps) {
  const label = getShortRRuleLabel(rrule);

  if (!label) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
        variant === "default" &&
          "bg-secondary text-secondary-foreground",
        variant === "overlay" &&
          "bg-black/60 text-white backdrop-blur-sm",
        className
      )}
    >
      <Repeat className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}
