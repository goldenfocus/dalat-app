"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MomentCard } from "./moment-card";
import { useMomentCommentCounts } from "@/lib/hooks/use-comment-counts";
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
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialMoments.length);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch comment counts for all visible moments
  const momentIds = useMemo(() => moments.map(m => m.id), [moments]);
  const { counts: commentCounts } = useMomentCommentCounts(momentIds);

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

    setMoments((prev) => [...prev, ...newMoments]);
    setOffset((prev) => prev + newMoments.length);
    setIsLoading(false);
  }, [eventId, offset, isLoading, hasMore]);

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
            from="event"
            commentCount={commentCounts.get(moment.id)}
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
