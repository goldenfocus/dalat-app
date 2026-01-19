"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MomentReelCard } from "./moment-reel-card";
import { useMomentsFeed } from "@/lib/hooks/use-supabase-query";
import type { MomentContentType, MomentWithEvent } from "@/lib/types";

interface MomentsFeedProps {
  initialMoments: MomentWithEvent[];
  hasMore: boolean;
  contentTypes?: MomentContentType[];
}

/**
 * Main feed container with vertical scroll-snap.
 * Handles infinite scroll and active index tracking.
 *
 * Uses TanStack Query for caching and background refetching.
 */
export function MomentsFeed({
  initialMoments,
  contentTypes = ["photo", "video"],
}: MomentsFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Use TanStack Query for infinite scroll with caching
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMomentsFeed(contentTypes, initialMoments);

  // Flatten pages into single array of moments
  const moments = useMemo(
    () => data?.pages.flat() ?? initialMoments,
    [data?.pages, initialMoments]
  );

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

  // Observe the load-more trigger element for infinite scroll
  useEffect(() => {
    const trigger = loadMoreRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
        className="w-full max-w-lg lg:max-w-xl h-[100dvh] overflow-y-auto snap-y snap-mandatory overscroll-contain scrollbar-hide"
      >
        {moments.map((moment, index) => (
          <MomentReelCard
            key={moment.id}
            moment={moment}
            isActive={activeIndex === index}
            index={index}
          />
        ))}

        {/* Infinite scroll trigger */}
        {hasNextPage && (
          <div
            ref={loadMoreRef}
            className="h-20 flex items-center justify-center bg-black"
          >
            {isFetchingNextPage && (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
