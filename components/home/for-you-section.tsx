"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { EventCard } from "@/components/events/event-card";
import type { Event, EventCounts, FriendsAttending } from "@/lib/types";

/**
 * Personalized "For You" event recommendations.
 * Client component - user-specific, can't be ISR cached.
 * Only renders for logged-in users with recommendations.
 */
export function ForYouSection() {
  const t = useTranslations("home");
  const [events, setEvents] = useState<Event[]>([]);
  const [counts, setCounts] = useState<Record<string, EventCounts>>({});
  const [friendsData, setFriendsData] = useState<Record<string, FriendsAttending>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecommendations() {
      const supabase = createClient();

      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Fetch recommended events
      const { data: recommended, error } = await supabase.rpc("get_recommended_events", {
        p_user_id: user.id,
        p_limit: 6,
      });

      if (error || !recommended || recommended.length === 0) {
        setLoading(false);
        return;
      }

      setEvents(recommended as Event[]);

      // Batch fetch counts and friends attending
      const eventIds = recommended.map((e: Event) => e.id);

      const [countsResult, friendsResult] = await Promise.all([
        supabase.rpc("get_event_counts_batch", { p_event_ids: eventIds }),
        supabase.rpc("get_friends_attending_batch", {
          p_user_id: user.id,
          p_event_ids: eventIds,
        }),
      ]);

      // Process counts
      if (countsResult.data) {
        const countsMap: Record<string, EventCounts> = {};
        for (const row of countsResult.data as Array<{ event_id: string } & EventCounts>) {
          countsMap[row.event_id] = row;
        }
        setCounts(countsMap);
      }

      // Process friends attending
      if (friendsResult.data) {
        const friendsMap: Record<string, FriendsAttending> = {};
        for (const item of friendsResult.data as FriendsAttending[]) {
          friendsMap[item.event_id] = item;
        }
        setFriendsData(friendsMap);
      }

      setLoading(false);
    }

    fetchRecommendations();
  }, []);

  // Don't render anything while loading or if no recommendations
  if (loading) {
    return <ForYouSkeleton />;
  }

  if (events.length === 0) {
    return null;
  }

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
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            counts={counts[event.id]}
            friendsAttending={friendsData[event.id]}
            isFlipped={flippedCardId === event.id}
            onFlip={setFlippedCardId}
          />
        ))}
      </div>
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
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-[4/5] bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </section>
  );
}
