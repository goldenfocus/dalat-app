import type { Event } from "@/lib/types";

export type MapProvider = "leaflet" | "google";

export interface MapAdapterProps {
    events: Event[];
    selectedEventId?: string | null;
    onEventSelect: (event: Event) => void;
    className?: string;
    // Common map options
    defaultCenter?: [number, number];
    defaultZoom?: number;
}
