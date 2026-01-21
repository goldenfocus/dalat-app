"use client";

import { useState, useMemo } from "react";
import { MapPin, Calendar, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapLandingPage } from "@/components/map/map-landing-page";
import { EventCalendarView } from "@/components/events/event-calendar-view";
import { FilterPanel } from "@/components/events/filter-panel";
import { Button } from "@/components/ui/button";
import type { EventCounts, EventFilters, EventWithFilterData } from "@/lib/types";

interface ExploreViewProps {
    events: EventWithFilterData[];
    counts: Record<string, EventCounts>;
}

type ViewMode = "map" | "calendar";

export function ExploreView({ events, counts }: ExploreViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("map");
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState<Partial<EventFilters>>({});

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.searchQuery) count++;
        if (filters.categories && filters.categories.length > 0) count++;
        if (filters.priceFilter && filters.priceFilter !== "all") count++;
        if (filters.dateRange) count++;
        if (filters.radiusKm) count++;
        return count;
    }, [filters]);

    // Apply filters to events
    const filteredEvents = useMemo(() => {
        let result = [...events];

        // Search query filter
        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            result = result.filter(event =>
                event.title.toLowerCase().includes(query) ||
                (event.location_name && event.location_name.toLowerCase().includes(query)) ||
                (event.description && event.description.toLowerCase().includes(query))
            );
        }

        // Date range filter
        if (filters.dateRange?.start && filters.dateRange?.end) {
            const start = new Date(filters.dateRange.start).getTime();
            const end = new Date(filters.dateRange.end).getTime();
            result = result.filter(event => {
                const eventTime = new Date(event.starts_at).getTime();
                return eventTime >= start && eventTime <= end;
            });
        }

        // Category filter
        if (filters.categories && filters.categories.length > 0) {
            result = result.filter(event => {
                const eventCategories = event.category_ids || [];
                return filters.categories!.some(cat => eventCategories.includes(cat));
            });
        }

        // Price filter
        if (filters.priceFilter && filters.priceFilter !== "all") {
            result = result.filter(event => {
                const isFree = event.price_type === "free";
                return filters.priceFilter === "free" ? isFree : !isFree;
            });
        }

        return result;
    }, [events, filters]);

    const handleApplyFilters = (newFilters: Partial<EventFilters>) => {
        setFilters(newFilters);
        setIsFilterOpen(false);
    };

    return (
        <div className="h-screen flex flex-col">
            {/* View Toggle with Filter Button - Fixed at top */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="inline-flex bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setViewMode("map")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === "map"
                                ? "bg-white text-green-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        )}
                    >
                        <MapPin className="w-4 h-4" />
                        Map
                    </button>
                    <button
                        onClick={() => setViewMode("calendar")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === "calendar"
                                ? "bg-white text-green-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        )}
                    >
                        <Calendar className="w-4 h-4" />
                        Calendar
                    </button>
                </div>

                {/* Filter Button */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFilterOpen(true)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg transition-all active:scale-95",
                        activeFilterCount > 0 && "border-green-500 text-green-600"
                    )}
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Filters</span>
                    {activeFilterCount > 0 && (
                        <span className="flex items-center justify-center w-5 h-5 text-xs font-bold bg-green-600 text-white rounded-full">
                            {activeFilterCount}
                        </span>
                    )}
                </Button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {viewMode === "map" ? (
                    <MapLandingPage
                        events={filteredEvents}
                        counts={counts}
                        hideTopNav
                        hideHeader
                    />
                ) : (
                    <div className="h-full overflow-y-auto bg-gray-50">
                        <EventCalendarView events={filteredEvents} counts={counts} />
                    </div>
                )}
            </div>

            {/* Filter Panel */}
            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApplyFilters={handleApplyFilters}
                initialFilters={filters}
            />
        </div>
    );
}
