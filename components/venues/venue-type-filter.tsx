"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VENUE_TYPE_CONFIG, VENUE_TYPES } from "@/lib/constants/venue-types";
import type { VenueType } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VenueTypeFilterProps {
  selectedType: VenueType | null;
  typeCounts: Record<VenueType, number>;
}

export function VenueTypeFilter({ selectedType, typeCounts }: VenueTypeFilterProps) {
  const t = useTranslations("venues");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only show types that have venues
  const availableTypes = useMemo(() => {
    return VENUE_TYPES.filter((type) => (typeCounts[type] || 0) > 0);
  }, [typeCounts]);

  const totalCount = useMemo(() => {
    return Object.values(typeCounts).reduce((sum, count) => sum + count, 0);
  }, [typeCounts]);

  const handleTypeChange = (type: VenueType | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (type === null) {
      params.delete("type");
    } else {
      params.set("type", type);
    }

    router.push(`/venues?${params.toString()}`, { scroll: false });
  };

  // Don't render filter if there are no venues or only one type
  if (totalCount === 0 || availableTypes.length <= 1) {
    return null;
  }

  const selectedConfig = selectedType ? VENUE_TYPE_CONFIG[selectedType] : null;
  const SelectedIcon = selectedConfig?.icon;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all active:scale-95",
              selectedType
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {selectedType && SelectedIcon ? (
              <SelectedIcon className="w-4 h-4" />
            ) : (
              <SlidersHorizontal className="w-4 h-4" />
            )}
            <span>
              {selectedType ? t(`types.${selectedType}`) : t("filterByType")}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {/* All types option */}
          <DropdownMenuItem
            onClick={() => handleTypeChange(null)}
            className="py-2.5 px-3 cursor-pointer"
          >
            <span className="flex-1">{t("allTypes")}</span>
            <span className="text-xs text-muted-foreground ml-2">{totalCount}</span>
            {selectedType === null && <Check className="w-4 h-4 ml-2" />}
          </DropdownMenuItem>

          {/* Type options */}
          {availableTypes.map((type) => {
            const config = VENUE_TYPE_CONFIG[type];
            const Icon = config.icon;
            const isSelected = selectedType === type;
            const count = typeCounts[type] || 0;

            return (
              <DropdownMenuItem
                key={type}
                onClick={() => handleTypeChange(type)}
                className="py-2.5 px-3 cursor-pointer"
              >
                <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-1">{t(`types.${type}`)}</span>
                <span className="text-xs text-muted-foreground ml-2">{count}</span>
                {isSelected && <Check className="w-4 h-4 ml-2" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear button when filter is active */}
      {selectedType && (
        <button
          onClick={() => handleTypeChange(null)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95"
          aria-label="Clear filter"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
