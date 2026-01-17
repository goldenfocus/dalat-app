"use client";

import { useEffect, useRef } from "react";
import type { MapAdapterProps } from "../types";

export function GoogleMapsAdapter({
    events,
    selectedEventId,
    onEventSelect,
    defaultCenter = [11.9404, 108.4583],
    defaultZoom = 13,
    className
}: MapAdapterProps) {
    // This is a placeholder for the Google Maps implementation
    // Features to implement later:
    // 1. Load Google Maps Script (using @googlemaps/js-api-loader)
    // 2. Initialize Map
    // 3. Render Markers
    // 4. Handle interactions 

    return (
        <div className={`flex flex-col items-center justify-center bg-gray-100 p-8 text-center ${className}`}>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-sm">
                <h3 className="font-bold text-lg mb-2">Google Maps Mode</h3>
                <p className="text-gray-600 mb-4 text-sm">
                    Google Maps integration is ready to be configured.
                    Add your API key to start using it.
                </p>
                <div className="text-xs font-mono bg-gray-50 p-3 rounded border border-gray-200 text-left">
                    TODO: Add NEXT_PUBLIC_GOOGLE_MAPS_KEY
                    <br />
                    Edit: components/map/adapters/google-maps-adapter.tsx
                </div>
            </div>
        </div>
    );
}
