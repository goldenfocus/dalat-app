"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DiscoveryEventMomentsGroup } from "./discovery-event-moments-group";
import type { DiscoveryEventMomentsGroup as DiscoveryEventMomentsGroupType, MomentContentType } from "@/lib/types";

const EVENTS_PER_PAGE = 5;
const MOMENTS_PER_EVENT = 6;

interface InfiniteMomentDiscoveryGroupedProps {
  initialGroups: DiscoveryEventMomentsGroupType[];
  initialHasMore: boolean;
  contentTypes: MomentContentType[];
}

export function InfiniteMomentDiscoveryGrouped({
  initialGroups,
  initialHasMore,
  contentTypes,
}: InfiniteMomentDiscoveryGroupedProps) {
  const t = useTranslations("moments");

  const [groups, setGroups] = useState<DiscoveryEventMomentsGroupType[]>(initialGroups);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialGroups.length);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Memoize content types as a string for dependency tracking
  const contentKey = useMemo(() => contentTypes.join(","), [contentTypes]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_feed_moments_grouped", {
      p_event_limit: EVENTS_PER_PAGE,
      p_moments_per_event: MOMENTS_PER_EVENT,
      p_event_offset: offset,
      p_content_types: contentTypes,
    });

    if (error) {
      console.error("Failed to load more moments:", error);
      setIsLoading(false);
      return;
    }

    const newGroups = (data ?? []) as DiscoveryEventMomentsGroupType[];

    if (newGroups.length < EVENTS_PER_PAGE) {
      setHasMore(false);
    }

    setGroups((prev) => [...prev, ...newGroups]);
    setOffset((prev) => prev + newGroups.length);
    setIsLoading(false);
  }, [offset, isLoading, hasMore, contentTypes]);

  // Refetch when content types change
  const refetchWithFilter = useCallback(async () => {
    setIsLoading(true);
    setGroups([]);
    setOffset(0);
    setHasMore(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_feed_moments_grouped", {
      p_event_limit: EVENTS_PER_PAGE,
      p_moments_per_event: MOMENTS_PER_EVENT,
      p_event_offset: 0,
      p_content_types: contentTypes,
    });

    if (error) {
      console.error("Failed to load moments:", error);
      setIsLoading(false);
      return;
    }

    const newGroups = (data ?? []) as DiscoveryEventMomentsGroupType[];
    setGroups(newGroups);
    setOffset(newGroups.length);
    setHasMore(newGroups.length >= EVENTS_PER_PAGE);
    setIsLoading(false);
  }, [contentTypes]);

  // React to content type changes (skip initial render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetchWithFilter();
  }, [contentKey, refetchWithFilter]);

  // Intersection Observer for infinite scroll
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

  return (
    <div className="space-y-8">
      {/* Event groups */}
      {groups.length === 0 && !isLoading ? (
        <div className="text-center py-12">
          <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg mb-2">{t("noMoments")}</h3>
          <p className="text-muted-foreground text-sm">{t("beFirst")}</p>
        </div>
      ) : (
        groups.map((group) => (
          <DiscoveryEventMomentsGroup key={group.event_id} group={group} />
        ))
      )}

      {/* Loading indicator / Intersection Observer target */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
