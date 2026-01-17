"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { SearchBar } from "@/components/search/search-bar";
import { DatePresets } from "@/components/search/date-presets";
import { BottomSheet } from "@/components/map/bottom-sheet";
import { FilterPanel } from "@/components/events/filter-panel";
import type { Event, EventCounts } from "@/lib/types";

// Dynamically import map to avoid SSR issues
const MapContainer = dynamic(
    () => import("react-leaflet").then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import("react-leaflet").then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import("react-leaflet").then((mod) => mod.Marker),
    { ssr: false }
);

interface MapLandingPageProps {
    events: Event[];
    counts: Record<string, EventCounts>;
}

export function MapLandingPage({ events, counts }: MapLandingPageProps) {
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Mount check for Leaflet
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Default center: Da Lat, Vietnam
    const defaultCenter: [number, number] = [11.9404, 108.4583];
    const defaultZoom = 13;

    // Filter events that have coordinates
    const eventsWithCoords = events.filter(
        (event) => event.latitude && event.longitude
    );

    if (!isMounted) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="relative h-screen overflow-hidden">
            {/* Header Section */}
            <div className="absolute top-0 left-0 right-0 z-[1000] bg-white border-b border-gray-100">
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

            {/* Map - with top padding for header */}
            <div className="absolute inset-0 pt-[180px]">
                <MapContainer
                    center={defaultCenter}
                    zoom={defaultZoom}
                    className="h-full w-full"
                    style={{ background: "#f9fafb" }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {eventsWithCoords.map((event) => (
                        <Marker
                            key={event.id}
                            position={[event.latitude!, event.longitude!]}
                            eventHandlers={{
                                click: () => setSelectedEvent(event),
                            }}
                        />
                    ))}
                </MapContainer>
            </div>

            {/* Bottom Sheet */}
            <BottomSheet
                event={selectedEvent}
                counts={selectedEvent ? counts[selectedEvent.id] : undefined}
                onClose={() => setSelectedEvent(null)}
            />

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
