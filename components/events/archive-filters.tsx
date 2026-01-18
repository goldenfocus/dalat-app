"use client";

import { useState, useMemo, useEffect } from "react";
import { Clock, Users, Camera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { InstantSearch } from "@/components/search/instant-search";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Event, EventCounts } from "@/lib/types";

export type SortOption = "recent" | "popular" | "rich";

interface ArchiveFiltersProps {
  events: Event[];
  counts: Record<string, EventCounts>;
  momentsCounts?: Record<string, number>;
  onFilteredEventsChange: (events: Event[]) => void;
  className?: string;
}

export function ArchiveFilters({
  events,
  counts,
  momentsCounts = {},
  onFilteredEventsChange,
  className,
}: ArchiveFiltersProps) {
  const t = useTranslations("archive");
  const [sort, setSort] = useState<SortOption>("recent");
  const [showMyEvents, setShowMyEvents] = useState(false);
  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check auth status and fetch user's attended events
  useEffect(() => {
    const checkAuthAndFetchAttended = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setIsLoggedIn(true);
        const eventIds = events.map((e) => e.id);
        const { data } = await supabase.rpc("get_user_attended_event_ids", {
          p_event_ids: eventIds,
        });
        if (data) {
          setMyEventIds(new Set(data));
        }
      }
    };

    checkAuthAndFetchAttended();
  }, [events]);

  // Memoized sorting and filtering
  const sortedAndFilteredEvents = useMemo(() => {
    let result = [...events];

    // Apply "my events" filter
    if (showMyEvents && myEventIds.size > 0) {
      result = result.filter((e) => myEventIds.has(e.id));
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sort) {
        case "recent":
          // Most recent first
          return (
            new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
          );
        case "popular":
          // Most attendees first
          const aSpots = counts[a.id]?.going_spots ?? 0;
          const bSpots = counts[b.id]?.going_spots ?? 0;
          return bSpots - aSpots;
        case "rich":
          // Most moments/content first
          const aMoments = momentsCounts[a.id] ?? 0;
          const bMoments = momentsCounts[b.id] ?? 0;
          return bMoments - aMoments;
        default:
          return 0;
      }
    });

    return result;
  }, [events, counts, momentsCounts, sort, showMyEvents, myEventIds]);

  // Notify parent of filtered events
  useEffect(() => {
    onFilteredEventsChange(sortedAndFilteredEvents);
  }, [sortedAndFilteredEvents, onFilteredEventsChange]);

  const getSortIcon = () => {
    switch (sort) {
      case "recent":
        return Clock;
      case "popular":
        return Users;
      case "rich":
        return Camera;
      default:
        return Clock;
    }
  };

  const SortIcon = getSortIcon();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Instant search with dropdown suggestions */}
      <InstantSearch className="flex-1 max-w-sm" placeholder={t("search")} />

      {/* Sort dropdown - icon only */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "p-2 rounded-full border border-border bg-muted hover:bg-accent transition-colors",
              "active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center"
            )}
            aria-label={t("sortBy")}
          >
            <SortIcon className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(v) => setSort(v as SortOption)}
          >
            <DropdownMenuRadioItem value="recent" className="gap-2">
              <Clock className="w-4 h-4" />
              {t("sortRecent")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="popular" className="gap-2">
              <Users className="w-4 h-4" />
              {t("sortPopular")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="rich" className="gap-2">
              <Camera className="w-4 h-4" />
              {t("sortRich")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          {/* Advanced filter - only show if logged in */}
          {isLoggedIn && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showMyEvents}
                onCheckedChange={setShowMyEvents}
                className="gap-2"
              >
                {t("filterMyEvents")}
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear filter button - only show if "my events" is active */}
      {showMyEvents && (
        <button
          onClick={() => setShowMyEvents(false)}
          className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors active:scale-95"
          aria-label={t("clearFilters")}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
