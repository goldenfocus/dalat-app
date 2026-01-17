"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MapAdapterProps } from "../types";
import L from "leaflet"; // Import Leaflet for types and static methods

// Fix for default Leaflet marker icons in Next.js
const defaultIcon = L.icon({
    iconUrl: '/images/marker-icon.png',
    iconRetinaUrl: '/images/marker-icon-2x.png',
    shadowUrl: '/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

// Google-like marker icon (red pin with drop shadow)
// Using a custom div icon or an image would be best. 
// For now, let's use a nice SVG pin or similar if we have it locally. 
// Or better: use a DivIcon with Tailwind classes to make a CSS pin.

const createCustomIcon = (isSelected: boolean) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="${isSelected ? 'scale-125 z-50' : 'hover:scale-110'} transition-transform duration-200">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                    <path d="M12 0C7.58 0 4 3.58 4 8C4 13.54 12 24 12 24C12 24 20 13.54 20 8C20 3.58 16.42 0 12 0ZM12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11Z" fill="${isSelected ? '#EA4335' : '#FBBC04'}"/>
                </svg>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
    });
};

// React-Leaflet components must be imported dynamically for Next.js (SSR issues)
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

// Recenter Control Component - must also be dynamic to access useMap context safely?
// Actually, useMap hook will fail if the component using it is not rendered inside MapContainer.
// Since MapContainer is dynamic, any child using useMap should ideally be imported within the context or be safe.
// The best pattern here is to define RecenterControl as a regular component but only render it INSIDE MapContainer
// AND ensure MapContainer is only mounted on client.

// However, standard import of { useMap } from 'react-leaflet' often throws 'window is not defined' during SSR.
// So we need to lazy load the RecenterControl too.

const RecenterControl = dynamic(
    () => import("react-leaflet").then((mod) => {
        const { useMap } = mod;
        // Dynamically import Lucide icon to avoid SSR issues with the map
        // Actually we can just use SVG directly or import standard if we are in client component file
        // Since LeafletAdapter is "use client", we can import Lucide at top level?
        // But RecenterControl is inside dynamic... let's use a simple SVG or text for now to be safe, 
        // OR better: use the same style as Zoom controls.

        return function RecenterControlInner({ center }: { center: [number, number] }) {
            const map = useMap();
            return (
                <div className="leaflet-bottom leaflet-right" style={{ marginBottom: "80px", marginRight: "10px", pointerEvents: "auto", zIndex: 1000 }}>
                    <div className="leaflet-control leaflet-bar">
                        <button
                            className="bg-white hover:bg-gray-50 text-gray-600 p-0 cursor-pointer flex items-center justify-center w-[34px] h-[34px] bg-white border-b-0 rounded-sm shadow-md"
                            onClick={() => map.flyTo(center, 14)}
                            title="Center on Xuan Huong Lake"
                            type="button"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="2" />
                            </svg>
                        </button>
                    </div>
                </div>
            );
        };
    }),
    { ssr: false }
);

// Custom Zoom Control Component
const CustomZoomControl = dynamic(
    () => import("react-leaflet").then((mod) => {
        const { useMap } = mod;
        return function CustomZoomControlInner() {
            const map = useMap();
            return (
                <div className="leaflet-bottom leaflet-right" style={{ marginBottom: "130px", marginRight: "10px", pointerEvents: "auto", zIndex: 1000 }}>
                    <div className="flex flex-col gap-2">
                        <button
                            className="bg-white hover:bg-gray-50 text-gray-600 font-light text-2xl p-0 cursor-pointer flex items-center justify-center w-[34px] h-[34px] bg-white rounded-sm shadow-md"
                            onClick={() => map.zoomIn()}
                            title="Zoom In"
                            type="button"
                        >
                            +
                        </button>
                        <button
                            className="bg-white hover:bg-gray-50 text-gray-600 font-light text-2xl p-0 cursor-pointer flex items-center justify-center w-[34px] h-[34px] bg-white rounded-sm shadow-md"
                            onClick={() => map.zoomOut()}
                            title="Zoom Out"
                            type="button"
                        >
                            −
                        </button>
                    </div>
                </div>
            );
        };
    }),
    { ssr: false }
);

// Inner component for Leaflet specifics requiring static imports
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

    // Xuan Huong Lake Center
    const lakesideCenter: [number, number] = [11.942, 108.443];

    return (
        <div className={className}>
            <MapContainer
                center={defaultCenter}
                zoom={defaultZoom}
                className="h-full w-full"
                style={{ background: "#f9fafb" }}
                zoomControl={false}
            >
                <CustomZoomControl />
                <RecenterControl center={lakesideCenter} />

                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                {eventsWithCoords.map((event) => {
                    const isSelected = selectedEventId === event.id;
                    return (
                        <Marker
                            key={event.id}
                            position={[event.latitude!, event.longitude!]}
                            icon={createCustomIcon(isSelected)}
                            eventHandlers={{
                                click: () => onEventSelect(event),
                            }}
                            zIndexOffset={isSelected ? 1000 : 0}
                        />
                    );
                })}
            </MapContainer>
        </div>
    );
}
