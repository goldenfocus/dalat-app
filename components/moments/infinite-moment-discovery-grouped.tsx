"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DiscoveryEventMomentsGroup } from "./discovery-event-moments-group";
import { useMomentCommentCounts } from "@/lib/hooks/use-comment-counts";
import {
  DISCOVERY_EVENTS_PER_PAGE,
  getDiscoveryGalleries,
  type DiscoveryGallery,
} from "@/lib/moments/discovery-galleries";
import type { Locale, MomentContentType } from "@/lib/types";

interface InfiniteMomentDiscoveryGroupedProps {
  initialGroups: DiscoveryGallery[];
  initialHasMore: boolean;
  contentTypes: MomentContentType[];
}

export function InfiniteMomentDiscoveryGrouped({
  initialGroups,
  initialHasMore,
  contentTypes,
}: InfiniteMomentDiscoveryGroupedProps) {
  const t = useTranslations("moments");
  const locale = useLocale() as Locale;
  const [groups, setGroups] = useState(initialGroups);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(initialGroups.length);
  const loaderRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const allMomentIds = useMemo(() => groups.flatMap((group) => group.moments.map((m) => m.id)), [groups]);
  const { counts: commentCounts } = useMomentCommentCounts(allMomentIds);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setIsLoading(true);
    setFailed(false);

    try {
      const next = await getDiscoveryGalleries(createClient(), locale, contentTypes, offset);
      setGroups((previous) => {
        const seen = new Set(previous.map((group) => group.event_id));
        return [...previous, ...next.filter((group) => !seen.has(group.event_id))];
      });
      setOffset(offset + next.length);
      setHasMore(next.length === DISCOVERY_EVENTS_PER_PAGE);
    } catch (error) {
      console.error("Failed to load event galleries:", error);
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [contentTypes, hasMore, locale, offset]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader || !hasMore || isLoading || failed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(loader);
    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoading, failed]);

  return (
    <div>
      {groups.length === 0 && !hasMore && (
        <div className="py-12 text-center text-muted-foreground">
          <Camera className="mx-auto mb-4 size-10" aria-hidden="true" />
          <p>{t("noMoments")}</p>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        {groups.map((group) => (
          <DiscoveryEventMomentsGroup key={group.event_id} group={group} commentCounts={commentCounts} />
        ))}
      </div>
      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />}
        {failed && (
          <button type="button" className="min-h-11 rounded-lg px-4 text-sm hover:bg-muted" onClick={loadMore}>
            {t("retry")}
          </button>
        )}
      </div>
    </div>
  );
}
