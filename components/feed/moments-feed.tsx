"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MomentReelCard } from "./moment-reel-card";
import { MomentJoinCard } from "./moment-join-card";
import { useMomentsFeed } from "@/lib/hooks/use-supabase-query";
import { GATING_CONFIG } from "@/lib/config/gating";
import type { MomentContentType, MomentWithEvent } from "@/lib/types";

type FeedItem =
  | { type: "moment"; moment: MomentWithEvent; index: number }
  | { type: "join"; variant: "default" | "gentle"; index: number };

interface MomentsFeedProps {
  initialMoments: MomentWithEvent[];
  hasMore: boolean;
  contentTypes?: MomentContentType[];
  /** Whether the user is authenticated (hides gates when true) */
  isAuthenticated?: boolean;
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
  isAuthenticated = false,
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

  // Build feed items with interstitial join cards for anonymous users
  const feedItems = useMemo<FeedItem[]>(() => {
    if (isAuthenticated || !GATING_CONFIG.ENABLED) {
      // Authenticated users see all moments without gates
      return moments.map((moment, index) => ({
        type: "moment" as const,
        moment,
        index,
      }));
    }

    // Anonymous users: insert join cards at configured positions
    const items: FeedItem[] = [];
    let feedIndex = 0;

    for (let i = 0; i < moments.length; i++) {
      // Insert first gate
      if (i === GATING_CONFIG.MOBILE_FIRST_GATE_POSITION) {
        items.push({ type: "join", variant: "default", index: feedIndex });
        feedIndex++;
      }

      // Insert second (gentle) gate
      if (i === GATING_CONFIG.MOBILE_SECOND_GATE_POSITION) {
        items.push({ type: "join", variant: "gentle", index: feedIndex });
        feedIndex++;
      }

      items.push({ type: "moment", moment: moments[i], index: feedIndex });
      feedIndex++;
    }

    return items;
  }, [moments, isAuthenticated]);

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
  }, [feedItems.length]);

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
        {feedItems.map((item) =>
          item.type === "moment" ? (
            <MomentReelCard
              key={item.moment.id}
              moment={item.moment}
              isActive={activeIndex === item.index}
              index={item.index}
            />
          ) : (
            <MomentJoinCard
              key={`join-${item.variant}-${item.index}`}
              variant={item.variant}
              index={item.index}
            />
          )
        )}

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
