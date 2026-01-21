"use client";

import { useState } from "react";
import { MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapLandingPage } from "@/components/map/map-landing-page";
import { EventCalendarView } from "@/components/events/event-calendar-view";
import type { Event, EventCounts } from "@/lib/types";

interface ExploreViewProps {
    events: Event[];
    counts: Record<string, EventCounts>;
}

type ViewMode = "map" | "calendar";

export function ExploreView({ events, counts }: ExploreViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("map");

    return (
        <div className="h-screen flex flex-col">
            {/* View Toggle - Fixed at top */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-2 shrink-0">
                <div className="inline-flex bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setViewMode("map")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === "map"
                                ? "bg-white text-green-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        )}
                    >
                        <MapPin className="w-4 h-4" />
                        Map
                    </button>
                    <button
                        onClick={() => setViewMode("calendar")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === "calendar"
                                ? "bg-white text-green-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        )}
                    >
                        <Calendar className="w-4 h-4" />
                        Calendar
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {viewMode === "map" ? (
                    <MapLandingPage events={events} counts={counts} hideTopNav />
                ) : (
                    <div className="h-full overflow-y-auto bg-gray-50">
                        <EventCalendarView events={events} counts={counts} />
                    </div>
                )}
            </div>
        </div>
    );
}
