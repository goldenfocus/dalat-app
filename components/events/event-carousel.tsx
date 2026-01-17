"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Event, EventCounts } from "@/lib/types";

interface EventCarouselProps {
    events: Event[];
    counts: Record<string, EventCounts>;
    selectedEventId?: string | null;
    onEventSelect: (event: Event) => void;
    className?: string;
}

export function EventCarousel({
    events,
    counts,
    selectedEventId,
    onEventSelect,
    className
}: EventCarouselProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to selected event
    useEffect(() => {
        if (selectedEventId && scrollContainerRef.current) {
            const selectedElement = document.getElementById(`carousel-item-${selectedEventId}`);
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center",
                });
            }
        }
    }, [selectedEventId]);

    return (
        <div
            ref={scrollContainerRef}
            className={cn(
                "flex gap-4 overflow-x-auto px-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide",
                className
            )}
        >
            {events.map((event) => {
                const count = counts[event.id];
                const isSelected = selectedEventId === event.id;

                return (
                    <div
                        key={event.id}
                        id={`carousel-item-${event.id}`}
                        onClick={() => onEventSelect(event)}
                        className={cn(
                            "flex-shrink-0 w-[280px] bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden snap-center transition-all duration-300 cursor-pointer",
                            isSelected ? "ring-2 ring-green-600 shadow-lg scale-[1.02]" : "hover:shadow-lg"
                        )}
                    >
                        {/* Image */}
                        <div className="relative h-32 w-full bg-gray-100">
                            {event.image_url ? (
                                <img
                                    src={event.image_url}
                                    alt={event.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <Calendar className="w-8 h-8" />
                                </div>
                            )}
                            {/* Highlight badge if selected */}
                            {isSelected && (
                                <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                                    Selected
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-3">
                            <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">
                                {event.title}
                            </h3>

                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                    <span>
                                        {format(new Date(event.starts_at), "EEE, MMM d • h:mm a")}
                                    </span>
                                </div>

                                {event.location_name && (
                                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="line-clamp-1">{event.location_name}</span>
                                    </div>
                                )}

                                {count && (
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 pt-1">
                                        <Users className="w-3.5 h-3.5" />
                                        <span>{count.going_count} going</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Spacer for end of list */}
            <div className="w-1 flex-shrink-0" />
        </div>
    );
}
