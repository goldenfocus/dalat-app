"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MARKER_COLORS } from "./map-styles";
import { VENUE_MARKER_COLORS } from "@/lib/constants/venue-types";

export function MapLegend() {
  const t = useTranslations("mapPage");
  const [isOpen, setIsOpen] = useState(false);

  // Default expanded on desktop, collapsed on mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    setIsOpen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsOpen(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return (
    <div className="absolute bottom-24 left-4 z-10">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border overflow-hidden">
          <CollapsibleTrigger className="flex items-center justify-between gap-2 px-3 py-2 w-full text-left hover:bg-muted/50 transition-colors">
            <span className="text-sm font-medium">{t("legend")}</span>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
              {/* Happening Now - Red with pulse */}
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <span
                    className="absolute w-3 h-3 rounded-full animate-ping opacity-75"
                    style={{ backgroundColor: MARKER_COLORS.happening.light }}
                  />
                  <span
                    className="relative w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: MARKER_COLORS.happening.light }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("happeningNow")}
                </span>
              </div>

              {/* Upcoming - Green */}
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: MARKER_COLORS.default.light }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("upcoming")}
                </span>
              </div>

              {/* Venue - Gray */}
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: VENUE_MARKER_COLORS.default.light }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("venue")}
                </span>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
