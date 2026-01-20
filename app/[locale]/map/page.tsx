import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { MapLandingPage } from "@/components/map/map-landing-page";
import type { Event, EventCounts } from "@/lib/types";

async function getEvents() {
    const supabase = await createClient();

    // Try using filter_events RPC first, fallback to get_events_by_lifecycle
    try {
        const { data: events, error } = await supabase.rpc("filter_events", {
            p_lifecycle: "upcoming",
            p_categories: null,
            p_price_filter: null,
            p_search_query: null,
            p_start_date: null,
            p_end_date: null,
            p_user_lat: null,
            p_user_lng: null,
            p_radius_km: null,
            p_limit: 500,
        });

        if (!error && events) {
            return events as Event[];
        }
    } catch (err) {
        console.log("filter_events RPC not available, using fallback");
    }

    // Fallback to old RPC
    const { data: events, error } = await supabase.rpc("get_events_by_lifecycle", {
        p_lifecycle: "upcoming",
        p_limit: 500,
    });

    if (error) {
        console.error("Error fetching events:", error);
        return [];
    }

    return events as Event[];
}

async function getEventCounts(eventIds: string[]) {
    if (eventIds.length === 0) return {};

    const supabase = await createClient();

    const { data: rsvps } = await supabase
        .from("rsvps")
        .select("event_id, status, plus_ones")
        .in("event_id", eventIds);

    const counts: Record<string, EventCounts> = {};

    for (const eventId of eventIds) {
        const eventRsvps = rsvps?.filter((r) => r.event_id === eventId) || [];
        const goingRsvps = eventRsvps.filter((r) => r.status === "going");
        const waitlistRsvps = eventRsvps.filter((r) => r.status === "waitlist");
        const interestedRsvps = eventRsvps.filter((r) => r.status === "interested");

        counts[eventId] = {
            event_id: eventId,
            going_count: goingRsvps.length,
            waitlist_count: waitlistRsvps.length,
            going_spots: goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0),
            interested_count: interestedRsvps.length,
        };
    }

    return counts;
}

export default async function MapPage() {
    const events = await getEvents();
    const eventIds = events.map((e) => e.id);
    const counts = await getEventCounts(eventIds);

    return (
        <Suspense
            fallback={
                <div className="h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-gray-500">Loading map...</div>
                </div>
            }
        >
            <MapLandingPage events={events} counts={counts} />
        </Suspense>
    );
}
