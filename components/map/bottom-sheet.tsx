"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Event, EventCounts } from "@/lib/types";

interface BottomSheetProps {
    event: Event | null;
    counts?: EventCounts;
    onClose?: () => void;
}

export function BottomSheet({ event, counts, onClose }: BottomSheetProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [startY, setStartY] = useState(0);
    const sheetRef = useRef<HTMLDivElement>(null);

    if (!event) return null;

    const handleTouchStart = (e: React.TouchEvent) => {
        setStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 50 && isExpanded) {
            setIsExpanded(false);
        } else if (diff < -50 && !isExpanded) {
            setIsExpanded(true);
        }
    };

    return (
        <>
            {/* Backdrop for expanded state */}
            {isExpanded && (
                <div
                    className="fixed inset-0 bg-black/20 z-[998]"
                    onClick={() => setIsExpanded(false)}
                />
            )}

            {/* Bottom Sheet */}
            <div
                ref={sheetRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                className={cn(
                    "fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[999] transition-all duration-300 ease-out",
                    isExpanded ? "h-[90vh]" : "h-32"
                )}
            >
                {/* Drag Handle */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-12 h-1 bg-gray-300 rounded-full" />
                </div>

                {/* Content */}
                <div className="px-4 pb-4 overflow-y-auto h-full">
                    {!isExpanded ? (
                        // Collapsed View - Preview
                        <div
                            className="flex gap-3 cursor-pointer"
                            onClick={() => setIsExpanded(true)}
                        >
                            {event.image_url && (
                                <img
                                    src={event.image_url}
                                    alt={event.title}
                                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm line-clamp-1 mb-1">
                                    {event.title}
                                </h3>
                                <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>
                                        {format(new Date(event.starts_at), "EEE, MMM d • h:mm a")}
                                    </span>
                                </div>
                                {event.location_name && (
                                    <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                        <MapPin className="w-3 h-3" />
                                        <span className="line-clamp-1">{event.location_name}</span>
                                    </div>
                                )}
                                {counts && (
                                    <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                        <Users className="w-3 h-3" />
                                        <span>{counts.going_count} going</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Expanded View - Full Details
                        <div className="pb-20">
                            {event.image_url && (
                                <img
                                    src={event.image_url}
                                    alt={event.title}
                                    className="w-full h-48 rounded-lg object-cover mb-4"
                                />
                            )}
                            <h2 className="text-xl font-bold mb-3">{event.title}</h2>

                            <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-2 text-gray-700">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm">
                                        {format(new Date(event.starts_at), "EEEE, MMMM d, yyyy • h:mm a")}
                                    </span>
                                </div>
                                {event.location_name && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <MapPin className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm">{event.location_name}</span>
                                    </div>
                                )}
                                {counts && (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <Users className="w-4 h-4" />
                                        <span className="text-sm font-medium">
                                            {counts.going_count} people going
                                        </span>
                                    </div>
                                )}
                            </div>

                            {event.description && (
                                <div className="mb-4">
                                    <h3 className="font-semibold mb-2">About</h3>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                        {event.description}
                                    </p>
                                </div>
                            )}

                            <a
                                href={`/events/${event.slug}`}
                                className="block w-full py-3 bg-green-600 text-white text-center rounded-lg font-medium hover:bg-green-700 transition-colors"
                            >
                                View Full Details
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
