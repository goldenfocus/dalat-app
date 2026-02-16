"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { EventCard } from "@/components/events/event-card";
import { useRecommendedEvents } from "@/components/home/recommended-events-context";
import type { Event, EventCounts, FriendsAttending } from "@/lib/types";

const DEFAULT_VISIBLE = 3;

/**
 * Personalized "For You" event recommendations.
 * Client component - user-specific, can't be ISR cached.
 * Shows for logged-in users with recommendations, or featured events for all.
 */
export function ForYouSection() {
  const t = useTranslations("home");
  const [events, setEvents] = useState<Event[]>([]);
  const [counts, setCounts] = useState<Record<string, EventCounts>>({});
  const [friendsData, setFriendsData] = useState<Record<string, FriendsAttending>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { setRecommendedIds } = useRecommendedEvents();

  useEffect(() => {
    async function fetchRecommendations() {
      const supabase = createClient();

      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();

      let recommended: Event[] = [];

      if (user) {
        setUserId(user.id);

        // Fetch recommended events
        const { data, error } = await supabase.rpc("get_recommended_events", {
          p_user_id: user.id,
          p_limit: 6,
        });

        if (!error && data && data.length > 0) {
          recommended = data as Event[];
        }
      }

      // Also fetch featured/sponsored events to ensure they're included
      const { data: featured } = await supabase
        .from("events")
        .select("*")
        .gt("sponsor_tier", 0)
        .eq("status", "published")
        .gt("starts_at", new Date().toISOString())
        .order("sponsor_tier", { ascending: false })
        .limit(3);

      // Merge featured into recommendations (featured first, dedup by id)
      if (featured && featured.length > 0) {
        const existingIds = new Set(recommended.map((e) => e.id));
        const newFeatured = (featured as Event[]).filter((e) => !existingIds.has(e.id));
        recommended = [...newFeatured, ...recommended];
      }

      if (recommended.length === 0) {
        setLoading(false);
        return;
      }

      setEvents(recommended);

      // Register IDs for dedup with Coming Up section
      setRecommendedIds(recommended.map((e) => e.id));

      // Batch fetch counts and friends attending
      const eventIds = recommended.map((e) => e.id);

      const promises: Promise<any>[] = [
        supabase.rpc("get_event_counts_batch", { p_event_ids: eventIds }),
      ];

      if (user) {
        promises.push(
          supabase.rpc("get_friends_attending_batch", {
            p_user_id: user.id,
            p_event_ids: eventIds,
          })
        );
      }

      const results = await Promise.all(promises);

      // Process counts
      if (results[0].data) {
        const countsMap: Record<string, EventCounts> = {};
        for (const row of results[0].data as Array<{ event_id: string } & EventCounts>) {
          countsMap[row.event_id] = row;
        }
        setCounts(countsMap);
      }

      // Process friends attending
      if (results[1]?.data) {
        const friendsMap: Record<string, FriendsAttending> = {};
        for (const item of results[1].data as FriendsAttending[]) {
          friendsMap[item.event_id] = item;
        }
        setFriendsData(friendsMap);
      }

      setLoading(false);
    }

    fetchRecommendations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render anything while loading or if no recommendations
  if (loading) {
    return <ForYouSkeleton />;
  }

  if (events.length === 0) {
    return null;
  }

  const visibleEvents = expanded ? events : events.slice(0, DEFAULT_VISIBLE);
  const hasMore = events.length > DEFAULT_VISIBLE;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t("forYou")}</h2>
          <p className="text-xs text-muted-foreground">{t("forYouSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            counts={counts[event.id]}
            friendsAttending={friendsData[event.id]}
            isFlipped={flippedCardId === event.id}
            onFlip={setFlippedCardId}
            showFullImage
          />
        ))}
      </div>

      {/* Show more / show less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
        >
          {expanded ? (
            <>
              {t("showLess")}
              <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              {t("showMore", { count: events.length - DEFAULT_VISIBLE })}
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </section>
  );
}

function ForYouSkeleton() {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 bg-muted rounded animate-pulse" />
        <div className="w-24 h-6 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="aspect-[4/5] bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </section>
  );
}
