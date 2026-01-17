"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MapAdapterProps } from "../types";
import { Icon } from "leaflet";

// Leaflet specific imports handling
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

// Inner component for Leaflet specifics requiring static imports
// We'll define this in a separate file or handle state differently
// For now, let's keep it simple: we reconstruct the map when provider changes

export function LeafletAdapter({
    events,
    selectedEventId,
    onEventSelect,
    defaultCenter = [11.9404, 108.4583],
    defaultZoom = 13,
    className
}: MapAdapterProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <div className={`flex items-center justify-center bg-gray-50 ${className}`}>
                <div className="text-gray-500">Loading Map...</div>
            </div>
        );
    }

    // Filter events that have coordinates
    const eventsWithCoords = events.filter(
        (event) => event.latitude && event.longitude
    );

    return (
        <div className={className}>
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
                            click: () => onEventSelect(event),
                        }}
                    // Highlight selected marker logic would go here
                    // We'd need a custom icon for selected state
                    />
                ))}
            </MapContainer>
        </div>
    );
}
