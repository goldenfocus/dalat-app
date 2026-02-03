"use client";

import { Layers, Image, Film } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaTypeFilter = "all" | "photo" | "video";

interface MediaTypeFilterProps {
  value: MediaTypeFilter;
  onChange: (value: MediaTypeFilter) => void;
  className?: string;
  /** Whether to show this filter (hide if no videos in album) */
  hasVideos?: boolean;
}

/**
 * Subtle icon-only filter to toggle between all media, photos only, or videos only.
 * Designed to be discreet and blend with the view mode switcher.
 */
export function MediaTypeFilterToggle({
  value,
  onChange,
  className,
  hasVideos = true,
}: MediaTypeFilterProps) {
  // Don't show filter if there are no videos (nothing to filter)
  if (!hasVideos) return null;

  const options: { key: MediaTypeFilter; icon: React.ReactNode; label: string }[] = [
    { key: "all", icon: <Layers className="w-4 h-4" />, label: "All" },
    { key: "photo", icon: <Image className="w-4 h-4" />, label: "Photos" },
    { key: "video", icon: <Film className="w-4 h-4" />, label: "Videos" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-muted/50 p-0.5 gap-0.5",
        className
      )}
      role="radiogroup"
      aria-label="Filter by media type"
    >
      {options.map(({ key, icon, label }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={label}
          onClick={() => onChange(key)}
          className={cn(
            "p-1.5 rounded-md transition-all",
            value === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
