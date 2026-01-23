"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { VENUE_TYPE_CONFIG, VENUE_TYPES } from "@/lib/constants/venue-types";
import type { VenueType } from "@/lib/types";

interface VenueTypeFilterProps {
  selectedType: VenueType | null;
}

export function VenueTypeFilter({ selectedType }: VenueTypeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTypeChange = (type: VenueType | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (type === null) {
      params.delete("type");
    } else {
      params.set("type", type);
    }

    router.push(`/venues?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {/* All button */}
      <button
        type="button"
        onClick={() => handleTypeChange(null)}
        className={cn(
          "flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95",
          selectedType === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted hover:bg-muted/80 text-muted-foreground"
        )}
      >
        All
      </button>

      {/* Type buttons */}
      {VENUE_TYPES.map((type) => {
        const config = VENUE_TYPE_CONFIG[type];
        const Icon = config.icon;
        const isSelected = selectedType === type;

        return (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeChange(type)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95",
              isSelected
                ? cn(config.bgColor, config.darkBgColor, config.color, config.darkColor)
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
