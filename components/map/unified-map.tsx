"use client";

import dynamic from "next/dynamic";
import { GoogleMapsAdapter } from "./adapters/google-maps-adapter";
import type { MapAdapterProps, MapProvider } from "./types";

// Dynamically import Leaflet adapter with toggled off SSR to prevent window error
const LeafletAdapter = dynamic(
    () => import("./adapters/leaflet-adapter").then((mod) => mod.LeafletAdapter),
    { ssr: false }
);
// const LeafletAdapter = dynamic(() => import("./adapters/leaflet-adapter"), { ssr: false });
// The above line works if default export. But we use named export.
// Correct usage:
// const LeafletAdapter = dynamic(() => import('./adapters/leaflet-adapter').then(mod => mod.LeafletAdapter), { ssr: false });

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
