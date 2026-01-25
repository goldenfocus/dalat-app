"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, Plane, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface TripPlannerProps {
  startDate: string | null;
  endDate: string | null;
  onApply: (start: string, end: string) => void;
  onClear: () => void;
  eventCount: number;
}

export function TripPlanner({
  startDate,
  endDate,
  onApply,
  onClear,
  eventCount,
}: TripPlannerProps) {
  const t = useTranslations("calendar.tripPlanner");
  const [isOpen, setIsOpen] = useState(false);
  const [tempStart, setTempStart] = useState(startDate || "");
  const [tempEnd, setTempEnd] = useState(endDate || "");

  const hasActiveRange = startDate && endDate;

  const handleApply = () => {
    if (tempStart && tempEnd) {
      triggerHaptic("selection");
      onApply(tempStart, tempEnd);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    triggerHaptic("selection");
    setTempStart("");
    setTempEnd("");
    onClear();
    setIsOpen(false);
  };

  const handleToggle = (open: boolean) => {
    triggerHaptic("selection");
    setIsOpen(open);
    // Reset temp values when opening if there's an active range
    if (open && hasActiveRange) {
      setTempStart(startDate);
      setTempEnd(endDate);
    }
  };

  // Format the date range for display
  const formatDateRange = () => {
    if (!startDate || !endDate) return "";
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // If same month, use shorter format
    if (format(start, "MMM") === format(end, "MMM")) {
      return `${format(start, "MMM d")} - ${format(end, "d")}`;
    }
    return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <div className="px-4 pb-3">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors active:scale-[0.99]">
            {hasActiveRange ? (
              <div className="flex items-center gap-2 text-sm">
                <Plane className="w-4 h-4 text-primary" />
                <span className="font-medium">{formatDateRange()}</span>
                <span className="text-muted-foreground">
                  · {t("eventsInRange", { count: eventCount })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Plane className="w-4 h-4" />
                <span>{t("planningTrip")}</span>
              </div>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Date inputs */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {t("arriving")}
                </label>
                <input
                  type="date"
                  value={tempStart}
                  onChange={(e) => {
                    setTempStart(e.target.value);
                    triggerHaptic("selection");
                  }}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="block w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {t("leaving")}
                </label>
                <input
                  type="date"
                  value={tempEnd}
                  onChange={(e) => {
                    setTempEnd(e.target.value);
                    triggerHaptic("selection");
                  }}
                  min={tempStart || format(new Date(), "yyyy-MM-dd")}
                  className="block w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {hasActiveRange && (
                <button
                  onClick={handleClear}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm border rounded-lg hover:bg-muted transition-colors active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                  {t("clear")}
                </button>
              )}
              <button
                onClick={handleApply}
                disabled={!tempStart || !tempEnd}
                className="flex-1 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("apply")}
              </button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
