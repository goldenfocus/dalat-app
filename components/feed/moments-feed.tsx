"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MomentReelCard } from "./moment-reel-card";
import type { MomentContentType, MomentWithEvent, MomentLikeStatus } from "@/lib/types";

const PAGE_SIZE = 10;

interface MomentsFeedProps {
  initialMoments: MomentWithEvent[];
  initialLikes: MomentLikeStatus[];
  hasMore: boolean;
  contentTypes?: MomentContentType[];
}

/**
 * Main feed container with vertical scroll-snap.
 * Handles infinite scroll, active index tracking, and like status management.
 */
export function MomentsFeed({
  initialMoments,
  initialLikes,
  hasMore: initialHasMore,
  contentTypes = ["photo", "video"],
}: MomentsFeedProps) {
  const contentKey = contentTypes.join(",");
  const contentKeyRef = useRef(contentKey);
  const [moments, setMoments] = useState(initialMoments);
  const [likeStatuses, setLikeStatuses] = useState<Map<string, MomentLikeStatus>>(
    () => new Map(initialLikes.map((l) => [l.moment_id, l]))
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Track active card via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            const index = parseInt(
              entry.target.getAttribute("data-index") || "0",
              10
            );
            setActiveIndex(index);
          }
        });
      },
      { threshold: 0.7 }
    );

    const cards = container.querySelectorAll("[data-moment-card]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [moments.length]);

  // Infinite scroll: load more when reaching bottom
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);

    const supabase = createClient();

    const { data } = await supabase.rpc("get_feed_moments", {
      p_limit: PAGE_SIZE,
      p_offset: moments.length,
      p_content_types: contentTypes,
    });

    const newMoments = (data ?? []) as MomentWithEvent[];

    if (newMoments.length < PAGE_SIZE) {
      setHasMore(false);
    }

    if (newMoments.length > 0) {
      // Fetch like statuses for new moments
      const { data: likes } = await supabase.rpc("get_moment_like_counts", {
        p_moment_ids: newMoments.map((m) => m.id),
      });

      if (likes) {
        setLikeStatuses((prev) => {
          const next = new Map(prev);
          (likes as MomentLikeStatus[]).forEach((l) => {
            next.set(l.moment_id, l);
          });
          return next;
        });
      }

      setMoments((prev) => [...prev, ...newMoments]);
    }

    setIsLoading(false);
  }, [isLoading, hasMore, moments.length, contentTypes]);

  const resetFeed = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_feed_moments", {
      p_limit: PAGE_SIZE,
      p_offset: 0,
      p_content_types: contentTypes,
    });

    const newMoments = (data ?? []) as MomentWithEvent[];
    setHasMore(newMoments.length === PAGE_SIZE);
    setMoments(newMoments);
    setActiveIndex(0);

    if (newMoments.length > 0) {
      const { data: likes } = await supabase.rpc("get_moment_like_counts", {
        p_moment_ids: newMoments.map((m) => m.id),
      });
      if (likes) {
        setLikeStatuses(new Map((likes as MomentLikeStatus[]).map((l) => [l.moment_id, l])));
      }
    } else {
      setLikeStatuses(new Map());
    }

    setIsLoading(false);
  }, [contentTypes]);

  // Observe the load-more trigger element
  useEffect(() => {
    const trigger = loadMoreRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [loadMore]);

  // Reset feed when content types change
  useEffect(() => {
    if (contentKeyRef.current === contentKey) return;
    contentKeyRef.current = contentKey;
    resetFeed();
  }, [contentKey, resetFeed]);

  // Empty state
  if (moments.length === 0) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-black text-white/60">
        <div className="text-center px-6">
          <p className="text-lg font-medium mb-2">No moments yet</p>
          <p className="text-sm">
            Content from past events will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-black min-h-screen">
      <div
        ref={containerRef}
        className="w-full max-w-lg lg:max-w-xl h-[100dvh] overflow-y-auto snap-y snap-mandatory overscroll-contain scrollbar-hide pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
      >
        {moments.map((moment, index) => (
          <MomentReelCard
            key={moment.id}
            moment={moment}
            likeStatus={likeStatuses.get(moment.id)}
            isActive={activeIndex === index}
            index={index}
          />
        ))}

        {/* Infinite scroll trigger */}
        {hasMore && (
          <div
            ref={loadMoreRef}
            className="h-20 flex items-center justify-center bg-black"
          >
            {isLoading && (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
