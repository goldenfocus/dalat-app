"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { Event, VenueMapMarker } from "@/lib/types";

function MapSkeleton() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  );
}

interface DynamicEventMapProps {
  events: Event[];
  happeningEventIds?: string[];
  venues?: VenueMapMarker[];
}

// Dynamically import EventMap to code-split Google Maps + Supercluster (~150KB+)
export const DynamicEventMap = dynamic<DynamicEventMapProps>(
  () => import("./event-map").then((mod) => mod.EventMap),
  {
    loading: () => <MapSkeleton />,
    ssr: false,
  }
);
