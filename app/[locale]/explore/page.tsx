import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ExploreView } from "@/components/explore/explore-view";
import type { Event, EventCounts, EventWithFilterData } from "@/lib/types";

async function getEvents(): Promise<EventWithFilterData[]> {
    const supabase = await createClient();

    // Try using filter_events RPC first (includes category_ids)
    try {
        const { data: upcomingEvents, error: upcomingError } = await supabase.rpc("filter_events", {
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

        const { data: happeningEvents, error: happeningError } = await supabase.rpc("filter_events", {
            p_lifecycle: "happening",
            p_categories: null,
            p_price_filter: null,
            p_search_query: null,
            p_start_date: null,
            p_end_date: null,
            p_user_lat: null,
            p_user_lng: null,
            p_radius_km: null,
            p_limit: 50,
        });

        if (!upcomingError && !happeningError) {
            return [
                ...(upcomingEvents || []),
                ...(happeningEvents || []),
            ] as EventWithFilterData[];
        }
    } catch (err) {
        console.log("filter_events RPC not available, using fallback");
    }

    // Fallback: Use old RPC and manually fetch categories
    const { data: upcomingEvents } = await supabase.rpc("get_events_by_lifecycle", {
        p_lifecycle: "upcoming",
        p_limit: 500,
    });

    const { data: happeningEvents } = await supabase.rpc("get_events_by_lifecycle", {
        p_lifecycle: "happening",
        p_limit: 50,
    });

    const allEvents = [
        ...(upcomingEvents || []),
        ...(happeningEvents || []),
    ] as Event[];

    // Fetch categories for all events
    const eventIds = allEvents.map(e => e.id);
    const { data: categoryAssignments } = await supabase
        .from("event_category_assignments")
        .select("event_id, category_id")
        .in("event_id", eventIds);

    // Map events with their category_ids
    const eventsWithCategories: EventWithFilterData[] = allEvents.map(event => ({
        ...event,
        price_type: "free" as const, // Default for fallback
        price_amount: null,
        price_currency: "VND",
        price_note: null,
        distance_km: null,
        category_ids: categoryAssignments
            ?.filter(ca => ca.event_id === event.id)
            .map(ca => ca.category_id) || [],
    }));

    return eventsWithCategories;
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

export default async function ExplorePage() {
    const events = await getEvents();
    const eventIds = events.map((e) => e.id);
    const counts = await getEventCounts(eventIds);

    return (
        <Suspense
            fallback={
                <div className="h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-gray-500">Loading...</div>
                </div>
            }
        >
            <ExploreView events={events} counts={counts} />
        </Suspense>
    );
}
