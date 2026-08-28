"use client";

import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MomentCard } from "./moment-card";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import { useMomentCommentCounts } from "@/lib/hooks/use-comment-counts";
import type { MomentContentType, MomentVideoStatus, MomentWithProfile } from "@/lib/types";
import type { MediaTypeFilter } from "./media-type-filter";

const PAGE_SIZE = 20;
const VIDEO_PENDING_STATUSES = ["uploading", "processing", "error"] as const;

export interface InfiniteMomentGridHandle {
  loadMore: () => Promise<void>;
  hasMore: boolean;
  /** Drop moments from the grid's own state after a successful delete */
  removeMoments: (ids: string[]) => void;
}

interface InfiniteMomentGridProps {
  eventId: string;
  eventSlug: string;
  initialMoments: MomentWithProfile[];
  initialHasMore: boolean;
  /** Enable lightbox mode (modal instead of page navigation) */
  enableLightbox?: boolean;
  /** Callback when a moment card is clicked (for immersive mode) */
  onMomentClick?: (index: number) => void;
  /** Callback when moments array is updated (for parent to track all loaded moments) */
  onMomentsUpdate?: (moments: MomentWithProfile[]) => void;
  /** Filter by media type (all, photo, video) */
  mediaTypeFilter?: MediaTypeFilter;
  /** Selection mode props */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionToggle?: (momentId: string) => void;
  /** Current user ID (for determining which moments are selectable) */
  currentUserId?: string;
  /** Whether user can moderate (select any moment) */
  canModerate?: boolean;
  /** Delete a single moment from its tile — parent owns confirmation + RPC */
  onDeleteMoment?: (momentId: string) => void;
  /** A moment was already deleted elsewhere (e.g. the lightbox menu) — sync parent state */
  onMomentDeleted?: (momentId: string) => void;
}

type MomentQueryRow = MomentWithProfile & { captured_at: string | null };
type ProfileQueryRow = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
type PendingMomentQueryRow = {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  video_status: MomentVideoStatus | null;
  video_duration_seconds: number | null;
  text_content: string | null;
  created_at: string;
  captured_at: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  audio_duration_seconds: number | null;
  audio_thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
  profiles: ProfileQueryRow | ProfileQueryRow[];
};

function getTimelineStamp(moment: { captured_at: string | null; created_at: string }): number {
  return new Date(moment.captured_at || moment.created_at).getTime();
}

function pickProfile(profiles: ProfileQueryRow | ProfileQueryRow[]): ProfileQueryRow {
  return Array.isArray(profiles) ? profiles[0] ?? { username: null, display_name: null, avatar_url: null } : profiles;
}

function normalizePendingMoment(
  row: PendingMomentQueryRow
): MomentQueryRow {
  const profile = pickProfile(row.profiles);
  return {
    ...row,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
  };
}

export const InfiniteMomentGrid = forwardRef<InfiniteMomentGridHandle, InfiniteMomentGridProps>(function InfiniteMomentGrid({
  eventId,
  eventSlug,
  initialMoments,
  initialHasMore,
  enableLightbox = false,
  onMomentClick,
  onMomentsUpdate,
  mediaTypeFilter = "all",
  selectMode,
  selectedIds,
  onSelectionToggle,
  currentUserId,
  canModerate,
  onDeleteMoment,
  onMomentDeleted,
}: InfiniteMomentGridProps, ref) {
  const t = useTranslations("moments");
  const [moments, setMoments] = useState<MomentWithProfile[]>(initialMoments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(initialMoments.length);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Filter moments by media type
  const filteredMoments = useMemo(() => {
    if (mediaTypeFilter === "all") return moments;
    return moments.filter((m) => m.content_type === mediaTypeFilter);
  }, [moments, mediaTypeFilter]);

  // Fetch comment counts for all visible moments
  const momentIds = useMemo(() => filteredMoments.map(m => m.id), [filteredMoments]);
  const { counts: commentCounts } = useMomentCommentCounts(momentIds);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    const nextOffset = offset;

    const supabase = createClient();
    const nextWindow = nextOffset + PAGE_SIZE;
    const [readyResult, pendingResult, countResult] = await Promise.all([
      supabase.rpc("get_event_moments", {
        p_event_id: eventId,
        p_limit: nextWindow,
        p_offset: 0,
      }),
      supabase
        .from("moments")
        .select(`
          id,
          event_id,
          user_id,
          content_type,
          media_url,
          thumbnail_url,
          cf_video_uid,
          cf_playback_url,
          video_status,
          video_duration_seconds,
          text_content,
          created_at,
          captured_at,
          youtube_url,
          youtube_video_id,
          file_url,
          original_filename,
          file_size,
          mime_type,
          title,
          artist,
          album,
          audio_duration_seconds,
          audio_thumbnail_url,
          track_number,
          release_year,
          genre,
          profiles!inner (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq("event_id", eventId)
        .eq("status", "published")
        .eq("content_type", "video")
        .in("video_status", VIDEO_PENDING_STATUSES)
        .order("captured_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true })
        .limit(nextWindow),
      supabase
        .from("moments")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "published"),
    ]);

    if (readyResult.error) {
      console.error("Failed to load more moments:", readyResult.error);
      setIsLoading(false);
      return;
    }
    if (pendingResult.error) {
      console.error("Failed to load pending videos:", pendingResult.error);
      setIsLoading(false);
      return;
    }

    const readyMoments = (readyResult.data ?? []) as MomentQueryRow[];
    const pendingMoments = (pendingResult.data ?? []) as PendingMomentQueryRow[];

    const mergedMap = new Map<string, MomentQueryRow>();
    for (const moment of readyMoments) {
      mergedMap.set(moment.id, moment);
    }
    for (const moment of pendingMoments) {
      mergedMap.set(moment.id, normalizePendingMoment(moment));
    }

    const allMoments = Array.from(mergedMap.values()).sort((a, b) => {
      const stampA = getTimelineStamp(a);
      const stampB = getTimelineStamp(b);
      if (stampA === stampB) return a.id.localeCompare(b.id);
      return stampA - stampB;
    });

    const newMoments = allMoments.slice(nextOffset, nextOffset + PAGE_SIZE);
    const totalCount = countResult.count ?? allMoments.length;

    if (newMoments.length === 0) {
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    setMoments((prev) => {
      const updated = [...prev, ...newMoments];
      onMomentsUpdate?.(updated);
      return updated;
    });
    setOffset((prev) => prev + newMoments.length);
    setHasMore(totalCount > nextOffset + newMoments.length);
    setIsLoading(false);
  }, [eventId, offset, isLoading, hasMore, onMomentsUpdate]);

  // Expose loadMore and hasMore to parent via ref
  const removeMoments = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setMoments((prev) => prev.filter((m) => !drop.has(m.id)));
  }, []);

  // Delete initiated from inside the lightbox: the RPC already ran, so just drop
  // the tile here and let the container sync its own copy (immersive/cinema).
  const handleLightboxDelete = useCallback((momentId: string) => {
    removeMoments([momentId]);
    onMomentDeleted?.(momentId);
  }, [removeMoments, onMomentDeleted]);

  useImperativeHandle(ref, () => ({
    loadMore,
    hasMore,
    removeMoments,
  }), [loadMore, hasMore, removeMoments]);

  // Notify parent of initial moments
  useEffect(() => {
    onMomentsUpdate?.(moments);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Show empty state when filter has no results (but album has content)
  if (filteredMoments.length === 0 && moments.length > 0) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="text-muted-foreground text-sm">
          {mediaTypeFilter === "photo" ? t("noPhotos") : t("noVideos")}
        </p>
      </div>
    );
  }

  const gridContent = (
    <div className="space-y-4">
      {enableLightbox ? (
        <InnerGridWithLightbox
          moments={filteredMoments}
          eventSlug={eventSlug}
          commentCounts={commentCounts}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onSelectionToggle={onSelectionToggle}
          currentUserId={currentUserId}
          canModerate={canModerate}
          onDeleteMoment={onDeleteMoment}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filteredMoments.map((moment, index) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              eventSlug={eventSlug}
              from="event"
              commentCount={commentCounts.get(moment.id)}
              onLightboxOpen={onMomentClick ? () => onMomentClick(index) : undefined}
              selectMode={selectMode}
              isSelected={selectedIds?.has(moment.id)}
              isSelectable={canModerate || moment.user_id === currentUserId}
              onSelectionToggle={onSelectionToggle ? () => onSelectionToggle(moment.id) : undefined}
              canDelete={canModerate || moment.user_id === currentUserId}
              onDelete={onDeleteMoment ? () => onDeleteMoment(moment.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Loading indicator / Intersection Observer target */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {isLoading && (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );

  // Wrap with provider for lightbox mode
  if (enableLightbox) {
    return (
      <MomentsLightboxProvider
        moments={filteredMoments}
        eventSlug={eventSlug}
        onMomentDeleted={handleLightboxDelete}
      >
        {gridContent}
      </MomentsLightboxProvider>
    );
  }

  return gridContent;
});

/** Inner grid that uses the lightbox context */
function InnerGridWithLightbox({
  moments,
  eventSlug,
  commentCounts,
  selectMode,
  selectedIds,
  onSelectionToggle,
  currentUserId,
  canModerate,
  onDeleteMoment,
}: {
  moments: MomentWithProfile[];
  eventSlug: string;
  commentCounts: Map<string, number>;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionToggle?: (momentId: string) => void;
  currentUserId?: string;
  canModerate?: boolean;
  onDeleteMoment?: (momentId: string) => void;
}) {
  const { openLightbox } = useMomentsLightbox();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {moments.map((moment, index) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          eventSlug={eventSlug}
          from="event"
          commentCount={commentCounts.get(moment.id)}
          onLightboxOpen={selectMode ? undefined : () => openLightbox(index)}
          selectMode={selectMode}
          isSelected={selectedIds?.has(moment.id)}
          isSelectable={canModerate || moment.user_id === currentUserId}
          onSelectionToggle={onSelectionToggle ? () => onSelectionToggle(moment.id) : undefined}
          canDelete={canModerate || moment.user_id === currentUserId}
          onDelete={onDeleteMoment ? () => onDeleteMoment(moment.id) : undefined}
        />
      ))}
    </div>
  );
}
