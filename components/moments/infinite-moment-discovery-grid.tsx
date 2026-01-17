"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MomentCard } from "./moment-card";
import type { MomentContentType, MomentLikeStatus, MomentWithEvent } from "@/lib/types";

const PAGE_SIZE = 18;

interface InfiniteMomentDiscoveryGridProps {
  initialMoments: MomentWithEvent[];
  initialLikes: MomentLikeStatus[];
  initialHasMore: boolean;
  contentTypes: MomentContentType[];
}

function buildLikeMap(likes: MomentLikeStatus[]) {
  return likes.reduce<Record<string, { liked: boolean; count: number }>>((acc, like) => {
    acc[like.moment_id] = { liked: like.liked, count: like.count };
    return acc;
  }, {});
}

export function InfiniteMomentDiscoveryGrid({
  initialMoments,
  initialLikes,
  initialHasMore,
  contentTypes,
}: InfiniteMomentDiscoveryGridProps) {
  const t = useTranslations("moments");
  const contentKey = useMemo(() => contentTypes.join(","), [contentTypes]);
  const contentKeyRef = useRef(contentKey);

  const [moments, setMoments] = useState<MomentWithEvent[]>(initialMoments);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>(
    () => buildLikeMap(initialLikes)
  );
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialMoments.length);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchMoments = useCallback(async (offsetValue: number, replace: boolean) => {
    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_feed_moments", {
      p_limit: PAGE_SIZE,
      p_offset: offsetValue,
      p_content_types: contentTypes,
    });

    if (error) {
      console.error("Failed to fetch moments:", error);
      setIsLoading(false);
      return;
    }

    const newMoments = (data ?? []) as MomentWithEvent[];
    const nextHasMore = newMoments.length === PAGE_SIZE;

    if (newMoments.length > 0) {
      const { data: likes } = await supabase.rpc("get_moment_like_counts", {
        p_moment_ids: newMoments.map((m) => m.id),
      });

      if (likes) {
        const likeMap = buildLikeMap(likes as MomentLikeStatus[]);
        setLikeStatuses((prev) => (replace ? likeMap : { ...prev, ...likeMap }));
      }
    }

    if (replace) {
      setMoments(newMoments);
      setOffset(newMoments.length);
    } else {
      setMoments((prev) => [...prev, ...newMoments]);
      setOffset((prev) => prev + newMoments.length);
    }

    setHasMore(nextHasMore);
    setIsLoading(false);
  }, [contentTypes]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    await fetchMoments(offset, false);
  }, [fetchMoments, hasMore, isLoading, offset]);

  useEffect(() => {
    if (contentKeyRef.current === contentKey) return;
    contentKeyRef.current = contentKey;
    setOffset(0);
    setHasMore(true);
    fetchMoments(0, true);
  }, [contentKey, fetchMoments]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "120px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoading]);

  if (moments.length === 0 && !isLoading) {
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

      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
