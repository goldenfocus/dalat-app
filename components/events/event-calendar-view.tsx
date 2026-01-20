"use client";

import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { EventCard } from "./event-card";
import type { Event, EventCounts } from "@/lib/types";
import { cn } from "@/lib/utils";
import { downloadMultiEventICS } from "@/lib/utils/ics-export";

interface EventCalendarViewProps {
    events: Event[];
    counts: Record<string, EventCounts>;
}

type ViewMode = "month" | "week" | "day" | "agenda";

export function EventCalendarView({ events, counts }: EventCalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("month");

    // Group events by date
    const eventsByDate = useMemo(() => {
        const grouped: Record<string, Event[]> = {};
        events.forEach((event) => {
            const dateKey = format(new Date(event.starts_at), "yyyy-MM-dd");
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(event);
        });
        return grouped;
    }, [events]);

    // Get events for selected date
    const selectedDateEvents = useMemo(() => {
        if (!selectedDate) return [];
        const dateKey = format(selectedDate, "yyyy-MM-dd");
        return eventsByDate[dateKey] || [];
    }, [selectedDate, eventsByDate]);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        if (viewMode === "month") {
            const start = startOfWeek(startOfMonth(currentDate));
            const end = endOfWeek(endOfMonth(currentDate));
            return eachDayOfInterval({ start, end });
        } else if (viewMode === "week") {
            const start = startOfWeek(currentDate);
            const end = endOfWeek(currentDate);
            return eachDayOfInterval({ start, end });
        } else {
            return [currentDate];
        }
    }, [currentDate, viewMode]);

    const handlePrevious = () => {
        if (viewMode === "month") {
            setCurrentDate(subMonths(currentDate, 1));
        } else if (viewMode === "week") {
            setCurrentDate(subWeeks(currentDate, 1));
        }
    };

    const handleNext = () => {
        if (viewMode === "month") {
            setCurrentDate(addMonths(currentDate, 1));
        } else if (viewMode === "week") {
            setCurrentDate(addWeeks(currentDate, 1));
        }
    };

    const handleToday = () => {
        setCurrentDate(new Date());
        setSelectedDate(new Date());
    };

    const getEventsForDay = (day: Date) => {
        const dateKey = format(day, "yyyy-MM-dd");
        return eventsByDate[dateKey] || [];
    };

    // Group events for Agenda view (next 90 days)
    const agendaEvents = useMemo(() => {
        const today = new Date();
        const futureDate = addDays(today, 90);

        // Filter events in the next 90 days
        const filtered = events.filter(event => {
            const eventDate = new Date(event.starts_at);
            return eventDate >= today && eventDate <= futureDate;
        });

        // Sort by date
        filtered.sort((a, b) =>
            new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        );

        // Group by date
        const grouped: Record<string, Event[]> = {};
        filtered.forEach(event => {
            const dateKey = format(new Date(event.starts_at), "yyyy-MM-dd");
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(event);
        });

        return grouped;
    }, [events]);

    const handleExportCalendar = () => {
        // Export all visible events based on current view
        let eventsToExport: Event[] = [];

        if (viewMode === "agenda") {
            eventsToExport = Object.values(agendaEvents).flat();
        } else if (viewMode === "day") {
            eventsToExport = getEventsForDay(currentDate);
        } else if (viewMode === "week") {
            eventsToExport = calendarDays.flatMap(day => getEventsForDay(day));
        } else {
            eventsToExport = calendarDays
                .filter(day => isSameMonth(day, currentDate))
                .flatMap(day => getEventsForDay(day));
        }

        if (eventsToExport.length > 0) {
            const filename = `dalat-events-${format(currentDate, "yyyy-MM")}`;
            downloadMultiEventICS(eventsToExport, filename);
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row">
            {/* Calendar Section */}
            <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold">
                            {viewMode === "agenda" ? "Upcoming Events" : format(currentDate, "MMMM yyyy")}
                        </h2>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleExportCalendar}
                                className="border-gray-200"
                            >
                                <Download className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Export</span>
                            </Button>
                            {viewMode !== "agenda" && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleToday}
                                        className="border-gray-200"
                                    >
                                        Today
                                    </Button>
                                    <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handlePrevious}
                                            className="rounded-none border-r border-gray-200"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleNext}
                                            className="rounded-none"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* View Mode Selector */}
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant={viewMode === "month" ? "default" : "outline"}
                            onClick={() => setViewMode("month")}
                            className={viewMode === "month" ? "bg-green-600 hover:bg-green-700" : "border-gray-200"}
                        >
                            Month
                        </Button>
                        <Button
                            size="sm"
                            variant={viewMode === "week" ? "default" : "outline"}
                            onClick={() => setViewMode("week")}
                            className={viewMode === "week" ? "bg-green-600 hover:bg-green-700" : "border-gray-200"}
                        >
                            Week
                        </Button>
                        <Button
                            size="sm"
                            variant={viewMode === "day" ? "default" : "outline"}
                            onClick={() => setViewMode("day")}
                            className={viewMode === "day" ? "bg-green-600 hover:bg-green-700" : "border-gray-200"}
                        >
                            Day
                        </Button>
                        <Button
                            size="sm"
                            variant={viewMode === "agenda" ? "default" : "outline"}
                            onClick={() => setViewMode("agenda")}
                            className={viewMode === "agenda" ? "bg-green-600 hover:bg-green-700" : "border-gray-200"}
                        >
                            Agenda
                        </Button>
                    </div>
                </div>

                {/* Calendar Grid */}
                {viewMode === "month" && (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {/* Weekday Headers */}
                        <div className="grid grid-cols-7 border-b border-gray-200">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                                <div
                                    key={day}
                                    className="p-2 text-center text-sm font-semibold text-gray-600 border-r border-gray-200 last:border-r-0"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Days */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, index) => {
                                const dayEvents = getEventsForDay(day);
                                const isCurrentMonth = isSameMonth(day, currentDate);
                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                const isTodayDate = isToday(day);

                                return (
                                    <div
                                        key={index}
                                        className={cn(
                                            "min-h-[100px] p-2 border-r border-b border-gray-200 cursor-pointer transition-colors hover:bg-gray-50",
                                            !isCurrentMonth && "bg-gray-50 text-gray-400",
                                            isSelected && "bg-green-50 ring-2 ring-green-500",
                                            "last:border-r-0"
                                        )}
                                        onClick={() => setSelectedDate(day)}
                                    >
                                        <div
                                            className={cn(
                                                "text-sm font-medium mb-1",
                                                isTodayDate && "text-green-600 font-bold"
                                            )}
                                        >
                                            {format(day, "d")}
                                        </div>
                                        <div className="space-y-1">
                                            {dayEvents.slice(0, 3).map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="text-xs p-1 bg-green-100 text-green-800 rounded truncate"
                                                >
                                                    {event.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 3 && (
                                                <div className="text-xs text-gray-500">
                                                    +{dayEvents.length - 3} more
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Week View */}
                {viewMode === "week" && (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-7 gap-px bg-gray-200">
                            {calendarDays.map((day) => {
                                const dayEvents = getEventsForDay(day);
                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                const isTodayDate = isToday(day);

                                return (
                                    <div
                                        key={day.toISOString()}
                                        className={cn(
                                            "bg-white p-4 cursor-pointer hover:bg-gray-50 transition-colors",
                                            isSelected && "bg-green-50 ring-2 ring-green-500"
                                        )}
                                        onClick={() => setSelectedDate(day)}
                                    >
                                        <div className="text-center mb-3">
                                            <div className="text-sm text-gray-600">{format(day, "EEE")}</div>
                                            <div
                                                className={cn(
                                                    "text-2xl font-bold",
                                                    isTodayDate && "text-green-600"
                                                )}
                                            >
                                                {format(day, "d")}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {dayEvents.map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="text-xs p-2 bg-green-100 text-green-800 rounded"
                                                >
                                                    <div className="font-medium truncate">{event.title}</div>
                                                    <div className="text-green-600">
                                                        {format(new Date(event.starts_at), "h:mm a")}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Day View */}
                {viewMode === "day" && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <h3 className="text-xl font-bold mb-4">
                            {format(currentDate, "EEEE, MMMM d, yyyy")}
                        </h3>
                        <div className="space-y-4">
                            {getEventsForDay(currentDate).map((event) => (
                                <EventCard key={event.id} event={event} counts={counts[event.id]} />
                            ))}
                            {getEventsForDay(currentDate).length === 0 && (
                                <div className="text-center py-12 text-gray-500">
                                    No events scheduled for this day
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Agenda View */}
                {viewMode === "agenda" && (
                    <div className="space-y-8">
                        {Object.entries(agendaEvents).length > 0 ? (
                            Object.entries(agendaEvents).map(([dateKey, dayEvents]) => {
                                const date = parseISO(dateKey);
                                return (
                                    <div key={dateKey} className="bg-white rounded-lg border border-gray-200 p-6">
                                        <h3 className="font-bold text-xl mb-4 text-green-600">
                                            {format(date, "EEEE, MMMM d, yyyy")}
                                        </h3>
                                        <div className="space-y-4">
                                            {dayEvents.map((event) => (
                                                <EventCard key={event.id} event={event} counts={counts[event.id]} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="bg-white rounded-lg border border-gray-200 p-12">
                                <div className="text-center text-gray-500">
                                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-lg">No upcoming events in the next 90 days</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Selected Date Events - Desktop Sidebar */}
            {selectedDate && viewMode !== "day" && viewMode !== "agenda" && (
                <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 p-4 lg:p-6 overflow-y-auto bg-gray-50">
                    <h3 className="font-bold text-lg mb-4">
                        {format(selectedDate, "EEEE, MMM d")}
                    </h3>
                    {selectedDateEvents.length > 0 ? (
                        <div className="space-y-4">
                            {selectedDateEvents.map((event) => (
                                <EventCard key={event.id} event={event} counts={counts[event.id]} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <CalendarIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No events on this day</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
