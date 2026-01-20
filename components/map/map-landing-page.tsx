"use client";

import { useState } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { DatePresets } from "@/components/search/date-presets";
import { BottomSheet } from "@/components/map/bottom-sheet";
import { FilterPanel } from "@/components/events/filter-panel";
import { UnifiedMap } from "@/components/map/unified-map";
import { EventCarousel } from "@/components/events/event-carousel";
import { TopNav } from "@/components/navigation/top-nav";
import type { Event, EventCounts } from "@/lib/types";

interface MapLandingPageProps {
    events: Event[];
    counts: Record<string, EventCounts>;
}

export function MapLandingPage({ events, counts }: MapLandingPageProps) {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // State for filtered events
    const [filteredEvents, setFilteredEvents] = useState<Event[]>(events);

    // Update filtered events when initial events change (e.g. initial load)
    // useEffect(() => {
    //     setFilteredEvents(events);
    // }, [events]);

    // When an event is selected from the map or carousel
    const handleEventSelect = (event: Event) => {
        setSelectedEvent(event);
    };

    const handleApplyFilters = (filters: any) => {
        console.log("Applying filters:", filters);

        const { searchQuery, dateRange, categories, priceFilter } = filters;

        let result = [...events];

        // 1. Filter by Search Query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(event =>
                event.title.toLowerCase().includes(query) ||
                (event.location_name && event.location_name.toLowerCase().includes(query)) ||
                (event.description && event.description.toLowerCase().includes(query))
            );
        }

        // 2. Filter by Date Range
        if (dateRange && dateRange.start && dateRange.end) {
            const start = new Date(dateRange.start).getTime();
            const end = new Date(dateRange.end).getTime();

            result = result.filter(event => {
                const eventTime = new Date(event.starts_at).getTime();
                return eventTime >= start && eventTime <= end;
            });
        }

        // 3. Filter by Category & Price
        // Note: Event type currently lacks 'category' and 'price/is_free' fields.
        // We will skip these filters for now until the backend supports them.
        // if (categories.length > 0) { ... }
        // if (priceFilter !== 'all') { ... }

        setFilteredEvents(result);
        setIsFilterOpen(false);
    };

    return (
        <div className="relative h-screen overflow-hidden bg-gray-50 flex flex-col">
            {/* Top Navigation */}
            <TopNav />

            {/* Map Header Section */}
            <div className="relative z-[1000] bg-white border-b border-gray-100 shadow-sm">
                <div className="px-4 pt-4 pb-3">
                    {/* Title & Subtitle */}
                    <div className="mb-4">
                        <h1 className="text-2xl font-bold text-gray-900 mb-1">
                            Events in DaLat
                        </h1>
                        <p className="text-sm text-gray-600">
                            Discover what's happening in DaLat
                        </p>
                    </div>

                    {/* Search Bar */}
                    <SearchBar
                        onFilterClick={() => setIsFilterOpen(true)}
                        className="mb-3"
                    />

                    {/* Date Presets */}
                    <DatePresets
                        onDateSelect={(range) => {
                            handleApplyFilters({ dateRange: range });
                        }}
                    />
                </div>
            </div>

            {/* Map Area - Flex Item 1 */}
            <div className="flex-1 relative min-h-[50vh]">
                <UnifiedMap
                    provider="google" // Switched to Google Maps for premium experience
                    events={filteredEvents}
                    selectedEventId={selectedEvent?.id}
                    onEventSelect={handleEventSelect}
                    className="h-full w-full"
                />
            </div>

            {/* Carousel Area - Flex Item 2 (Separate Section) */}
            <div className="bg-white border-t border-gray-100 p-4 pb-20 lg:pb-4 z-10 w-full overflow-hidden shrink-0">
                <EventCarousel
                    events={filteredEvents}
                    counts={counts}
                    selectedEventId={selectedEvent?.id}
                    onEventSelect={handleEventSelect}
                />
            </div>

            {/* Filter Panel */}
            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApplyFilters={handleApplyFilters}
            />
        </div>
    );
}
