"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Camera, Image as ImageIcon, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileEventMomentsGroup } from "./profile-event-moments-group";
import type { EventMomentsGroup, MomentContentType } from "@/lib/types";

const EVENTS_PER_PAGE = 5;
const MOMENTS_PER_EVENT = 6;

type ContentFilter = "all" | "photo" | "video";

interface UserMomentsTimelineProps {
  userId: string;
  initialGroups: EventMomentsGroup[];
  initialHasMore: boolean;
}

export function UserMomentsTimeline({
  userId,
  initialGroups,
  initialHasMore,
}: UserMomentsTimelineProps) {
  const t = useTranslations("moments");
  const tProfile = useTranslations("profile");

  const [groups, setGroups] = useState<EventMomentsGroup[]>(initialGroups);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialGroups.length);
  const [filter, setFilter] = useState<ContentFilter>("all");
  const loaderRef = useRef<HTMLDivElement>(null);

  // Convert filter to content types array for RPC
  const getContentTypes = (f: ContentFilter): MomentContentType[] => {
    switch (f) {
      case "photo":
        return ["photo"];
      case "video":
        return ["video"];
      default:
        return ["photo", "video", "text"];
    }
  };

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_user_moments_grouped", {
      p_user_id: userId,
      p_event_limit: EVENTS_PER_PAGE,
      p_moments_per_event: MOMENTS_PER_EVENT,
      p_event_offset: offset,
      p_content_types: getContentTypes(filter),
    });

    if (error) {
      console.error("Failed to load more moments:", error);
      setIsLoading(false);
      return;
    }

    const newGroups = (data ?? []) as EventMomentsGroup[];

    if (newGroups.length < EVENTS_PER_PAGE) {
      setHasMore(false);
    }

    setGroups((prev) => [...prev, ...newGroups]);
    setOffset((prev) => prev + newGroups.length);
    setIsLoading(false);
  }, [userId, offset, isLoading, hasMore, filter]);

  // Refetch when filter changes
  const refetchWithFilter = useCallback(async (newFilter: ContentFilter) => {
    setIsLoading(true);
    setFilter(newFilter);
    setGroups([]);
    setOffset(0);
    setHasMore(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_user_moments_grouped", {
      p_user_id: userId,
      p_event_limit: EVENTS_PER_PAGE,
      p_moments_per_event: MOMENTS_PER_EVENT,
      p_event_offset: 0,
      p_content_types: getContentTypes(newFilter),
    });

    if (error) {
      console.error("Failed to load moments:", error);
      setIsLoading(false);
      return;
    }

    const newGroups = (data ?? []) as EventMomentsGroup[];
    setGroups(newGroups);
    setOffset(newGroups.length);
    setHasMore(newGroups.length >= EVENTS_PER_PAGE);
    setIsLoading(false);
  }, [userId]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoading]);

  const filterButtons: { key: ContentFilter; icon: React.ReactNode; label: string }[] = [
    { key: "all", icon: null, label: t("filters.all") },
    { key: "photo", icon: <ImageIcon className="w-4 h-4" />, label: t("filters.photos") },
    { key: "video", icon: <Video className="w-4 h-4" />, label: t("filters.videos") },
  ];

  return (
    <section className="space-y-4">
      {/* Section header with filter */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{tProfile("moments")}</h2>

        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {filterButtons.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => key !== filter && refetchWithFilter(key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors touch-manipulation
                ${filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                }
              `}
            >
              {icon}
              <span className={icon ? "sr-only sm:not-sr-only" : ""}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline content */}
      {groups.length === 0 && !isLoading ? (
        <div className="text-center py-12">
          <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg mb-2">{tProfile("noMomentsYet")}</h3>
          <p className="text-muted-foreground text-sm">{tProfile("noMomentsHint")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <ProfileEventMomentsGroup key={group.event_id} group={group} />
          ))}
        </div>
      )}

      {/* Loading indicator / Intersection Observer target */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </section>
  );
}
