"use client";

import { LeafletAdapter } from "./adapters/leaflet-adapter";
import { GoogleMapsAdapter } from "./adapters/google-maps-adapter";
import type { MapAdapterProps, MapProvider } from "./types";

interface UnifiedMapProps extends MapAdapterProps {
    provider?: MapProvider;
}

export function UnifiedMap({
    provider = "leaflet",
    ...props
}: UnifiedMapProps) {

    // Future: Could load provider from env or user settings
    // const effectiveProvider = process.env.NEXT_PUBLIC_MAP_PROVIDER || provider;

    if (provider === "google") {
        return <GoogleMapsAdapter {...props} />;
    }

    return <LeafletAdapter {...props} />;
}
