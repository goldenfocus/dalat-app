"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { EventCard } from "@/components/events/event-card";
import { useRecommendedEvents } from "@/components/home/recommended-events-context";
import type { Event, EventCounts, FriendsAttending } from "@/lib/types";

const DEFAULT_VISIBLE = 3;
const DISMISS_KEY = "hide-for-you-section";

/**
 * Personalized "For You" event recommendations.
 * Client component - user-specific, can't be ISR cached.
 * Only shows for logged-in users who have actual personalized recommendations.
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
  const [dismissed, setDismissed] = useState(false);
  const { setRecommendedIds } = useRecommendedEvents();

  // Check dismiss state from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    }
  }, []);

  useEffect(() => {
    async function fetchRecommendations() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();

      // Only show personalized recommendations for logged-in users
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase.rpc("get_recommended_events", {
        p_user_id: user.id,
        p_limit: 6,
      });

      if (error || !data || data.length === 0) {
        setLoading(false);
        return;
      }

      const recommended = data as Event[];
      setEvents(recommended);

      // Register IDs for dedup with Coming Up section
      setRecommendedIds(recommended.map((e) => e.id));

      // Batch fetch counts and friends attending
      const eventIds = recommended.map((e) => e.id);

      const [countsResult, friendsResult] = await Promise.all([
        supabase.rpc("get_event_counts_batch", { p_event_ids: eventIds }),
        supabase.rpc("get_friends_attending_batch", {
          p_user_id: user.id,
          p_event_ids: eventIds,
        }),
      ]);

      if (countsResult.data) {
        const countsMap: Record<string, EventCounts> = {};
        for (const row of countsResult.data as Array<{ event_id: string } & EventCounts>) {
          countsMap[row.event_id] = row;
        }
        setCounts(countsMap);
      }

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
    // Clear recommended IDs so Coming Up section shows them instead
    setRecommendedIds([]);
  }

  if (loading || dismissed || events.length === 0) {
    return null;
  }

  const visibleEvents = expanded ? events : events.slice(0, DEFAULT_VISIBLE);
  const hasMore = events.length > DEFAULT_VISIBLE;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold tracking-tight">{t("forYou")}</h2>
          <p className="text-xs text-muted-foreground">{t("forYouSubtitle")}</p>
        </div>
        <button
          onClick={handleDismiss}
          title={t("forYouDismiss")}
          className="p-2 -mr-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-lg shrink-0"
          aria-label={t("forYouDismiss")}
        >
          <X className="w-4 h-4" />
        </button>
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
