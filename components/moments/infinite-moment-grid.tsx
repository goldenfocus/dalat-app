"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MomentCard } from "./moment-card";
import type { MomentWithProfile } from "@/lib/types";

const PAGE_SIZE = 20;

interface InfiniteMomentGridProps {
  eventId: string;
  initialMoments: MomentWithProfile[];
  initialHasMore: boolean;
}

export function InfiniteMomentGrid({
  eventId,
  initialMoments,
  initialHasMore,
}: InfiniteMomentGridProps) {
  const t = useTranslations("moments");
  const [moments, setMoments] = useState<MomentWithProfile[]>(initialMoments);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialMoments.length);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch like statuses for a batch of moment IDs
  const fetchLikeStatuses = useCallback(async (momentIds: string[]) => {
    if (momentIds.length === 0) return;

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_moment_like_counts", {
      p_moment_ids: momentIds,
    });

    if (error) {
      console.error("Failed to fetch like statuses:", error);
      return;
    }

    if (data) {
      const newStatuses: Record<string, { liked: boolean; count: number }> = {};
      (data as { moment_id: string; liked: boolean; count: number }[]).forEach((item) => {
        newStatuses[item.moment_id] = { liked: item.liked, count: item.count };
      });
      setLikeStatuses((prev) => ({ ...prev, ...newStatuses }));
    }
  }, []);

  // Fetch likes for initial moments on mount
  useEffect(() => {
    if (initialMoments.length > 0) {
      fetchLikeStatuses(initialMoments.map((m) => m.id));
    }
  }, [initialMoments, fetchLikeStatuses]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_event_moments", {
      p_event_id: eventId,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      console.error("Failed to load more moments:", error);
      setIsLoading(false);
      return;
    }

    const newMoments = (data ?? []) as MomentWithProfile[];

    if (newMoments.length < PAGE_SIZE) {
      setHasMore(false);
    }

    // Fetch like statuses for new moments
    if (newMoments.length > 0) {
      fetchLikeStatuses(newMoments.map((m) => m.id));
    }

    setMoments((prev) => [...prev, ...newMoments]);
    setOffset((prev) => prev + newMoments.length);
    setIsLoading(false);
  }, [eventId, offset, isLoading, hasMore, fetchLikeStatuses]);

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

  if (moments.length === 0) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-2">{t("noMoments")}</h3>
        <p className="text-muted-foreground text-sm">{t("beFirst")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {moments.map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            likeStatus={likeStatuses[moment.id]}
          />
        ))}
      </div>

      {/* Loading indicator / Intersection Observer target */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
