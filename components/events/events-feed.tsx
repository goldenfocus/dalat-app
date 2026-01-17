"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";
import { Search, Calendar, MapPin, Users, Heart, Share2, Grid, List as ListIcon } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { TopNav } from "@/components/navigation/top-nav";
import { Button } from "@/components/ui/button";
import type { Event } from "@/lib/types";

// Mock data (replace with actual data fetching)
interface EventsPageProps {
    events: Event[]; // We'll need to fetch these in the page.tsx
}

export function EventsFeed({ events }: EventsPageProps) {
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [filterType, setFilterType] = useState<"upcoming" | "past">("upcoming");

    // Filter events based on filterType
    const filteredEvents = events.filter(event => {
        const isPast = new Date(event.starts_at) < new Date();
        return filterType === "upcoming" ? !isPast : isPast;
    });

    // Group events by date for List View
    const groupedEvents = events.reduce((acc, event) => {
        const dateKey = format(new Date(event.starts_at), "yyyy-MM-dd");
        if (!acc[dateKey]) {
            acc[dateKey] = [];
        }
        acc[dateKey].push(event);
        return acc;
    }, {} as Record<string, Event[]>);

    const sortedDates = Object.keys(groupedEvents).sort();

    return (
        <div className="min-h-screen bg-background">
            {/* Shared Header */}
            <TopNav />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Page Title & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-4xl font-extrabold text-foreground mb-1 tracking-tight">Events in Da Lat</h1>
                        <p className="text-muted-foreground">Discover what's happening in Da Lat</p>
                    </div>

                    <div className="relative w-full md:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-10 py-2 border border-border rounded-full bg-muted focus:bg-background focus:ring-2 focus:ring-black focus:border-transparent transition-colors"
                            placeholder="Search events..."
                        />
                        {/* View Toggle */}
                        <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
                            <div className="flex bg-gray-200 rounded-full p-1 mr-1">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-1 rounded-full ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Grid className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`p-1 rounded-full ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <ListIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters/Tabs */}
                <div className="w-full bg-muted p-1 rounded-lg flex mb-8 max-w-md">
                    <button
                        onClick={() => setFilterType("upcoming")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${filterType === "upcoming"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Upcoming
                    </button>
                    <button
                        onClick={() => setFilterType("past")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${filterType === "past"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <span className="text-lg">↺</span>
                        Past
                    </button>
                </div>

                {/* GRID VIEW */}
                {viewMode === 'grid' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredEvents.map((event) => (
                            <Link key={event.id} href={`/events/${event.slug || event.id}`} className="block group">
                                <div className="bg-card rounded-xl overflow-hidden hover:shadow-lg transition-shadow border border-border h-full flex flex-col">
                                    {/* Image */}
                                    <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
                                        {event.image_url ? (
                                            <img
                                                src={event.image_url}
                                                alt={event.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <Calendar className="w-12 h-12" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                                        <div className="absolute top-3 right-3 flex gap-2">
                                            <button className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/40 transition-colors" onClick={(e) => e.preventDefault()}>
                                                <Share2 className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/40 transition-colors" onClick={(e) => e.preventDefault()}>
                                                <Heart className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="p-4 flex-1 flex flex-col">
                                        <h3 className="font-bold text-foreground text-lg mb-2 line-clamp-2">
                                            {event.title}
                                        </h3>
                                        <div className="mt-auto space-y-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                <span>{format(new Date(event.starts_at), "EEE, MMM d • h:mm a")}</span>
                                            </div>
                                            {event.location_name && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span className="line-clamp-1">{event.location_name}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

                {/* LIST VIEW */}
                {viewMode === 'list' && (
                    <div className="space-y-8">
                        {sortedDates.map((dateStr) => {
                            const dateEvents = groupedEvents[dateStr];
                            const dateObj = new Date(dateEvents[0].starts_at);

                            return (
                                <section key={dateStr}>
                                    <h2 className="text-lg font-bold text-foreground mb-4 sticky top-16 bg-background py-2 z-10 border-b border-border">
                                        {format(dateObj, "EEEE, MMMM d")}
                                    </h2>
                                    <div className="space-y-4">
                                        {dateEvents.map((event) => (
                                            <Link key={event.id} href={`/events/${event.slug || event.id}`} className="block group">
                                                <div className="flex bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                                                    {/* Date Box (Desktop) */}
                                                    <div className="hidden sm:flex flex-col items-center justify-center w-20 bg-muted border-r border-border p-2 text-center">
                                                        <span className="text-xs text-red-500 font-bold uppercase">{format(new Date(event.starts_at), "MMM")}</span>
                                                        <span className="text-xl font-bold text-foreground">{format(new Date(event.starts_at), "d")}</span>
                                                    </div>

                                                    {/* Image (Small) */}
                                                    <div className="w-24 sm:w-32 aspect-square sm:aspect-video bg-gray-100 flex-shrink-0">
                                                        {event.image_url ? (
                                                            <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-300"><Calendar className="w-8 h-8" /></div>
                                                        )}
                                                    </div>

                                                    {/* Details */}
                                                    <div className="flex-1 p-4 flex flex-col justify-center">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <span className="text-xs font-semibold text-[#16a34a] mb-1 block">
                                                                    {format(new Date(event.starts_at), "h:mm a")}
                                                                </span>
                                                                <h3 className="font-bold text-foreground group-hover:text-[#16a34a] transition-colors line-clamp-1 mb-1">
                                                                    {event.title}
                                                                </h3>
                                                                <div className="flex items-center text-sm text-muted-foreground gap-1">
                                                                    <MapPin className="w-3.5 h-3.5" />
                                                                    <span className="line-clamp-1">{event.location_name || "Location TBA"}</span>
                                                                </div>
                                                            </div>

                                                            <Button variant="ghost" size="sm" className="hidden sm:flex self-center">
                                                                Tickets
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
