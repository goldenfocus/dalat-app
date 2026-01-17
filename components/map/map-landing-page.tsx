"use client";

import { useState } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { DatePresets } from "@/components/search/date-presets";
import { BottomSheet } from "@/components/map/bottom-sheet";
import { FilterPanel } from "@/components/events/filter-panel";
import { UnifiedMap } from "@/components/map/unified-map";
import { EventCarousel } from "@/components/events/event-carousel";
import type { Event, EventCounts } from "@/lib/types";

interface MapLandingPageProps {
    events: Event[];
    counts: Record<string, EventCounts>;
}

export function MapLandingPage({ events, counts }: MapLandingPageProps) {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // When an event is selected from the map or carousel
    const handleEventSelect = (event: Event) => {
        setSelectedEvent(event);
    };

    return (
        <div className="relative h-screen overflow-hidden bg-gray-50 flex flex-col">
            {/* Header Section */}
            <div className="absolute top-0 left-0 right-0 z-[1000] bg-white border-b border-gray-100 shadow-sm">
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
                    <DatePresets />
                </div>
            </div>

            {/* Map Area - Fills remaining space but respects header */}
            <div className="flex-1 relative mt-[185px] mb-16 lg:mb-0">
                <UnifiedMap
                    provider="leaflet" // Can be switched to "google"
                    events={events}
                    selectedEventId={selectedEvent?.id}
                    onEventSelect={handleEventSelect}
                />

                {/* Floating Carousel at Bottom */}
                <div className="absolute bottom-4 left-0 right-0 z-[1000]">
                    <EventCarousel
                        events={events} // In future: filter to visible events
                        counts={counts}
                        selectedEventId={selectedEvent?.id}
                        onEventSelect={handleEventSelect}
                    />
                </div>
            </div>

            {/* Bottom Sheet - Only shows when detailed info is needed?? 
          Or maybe we keep it dormant? 
          Actually, the Carousel handles the "preview". 
          Let's keep BottomSheet for now but maybe it opens on double tap or something else?
          Or maybe selecting an event in carousel opens the bottom sheet?
          
          For now, let's keep it simple: Carousel is the main way to browse.
          Tapping a carousel item selects it (highlights on map).
          Tapping it AGAIN or a "View Details" button could open the full page.
          
          The previous BottomSheet was essentially a preview. 
          Let's hide the Bottom Sheet for now as the Carousel serves the same purpose 
          but horizontal. Or we can keep it as a "Detail View" overlay.
      */}

            {/* Filter Panel */}
            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApplyFilters={(filters) => {
                    console.log("Filters applied:", filters);
                    setIsFilterOpen(false);
                }}
            />
        </div>
    );
}
