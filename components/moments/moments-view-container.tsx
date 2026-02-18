"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { CheckSquare, Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMomentsViewMode } from "@/lib/hooks/use-moments-view-mode";
import { ViewModeSwitcher } from "./view-mode-switcher";
import { FloatingViewModeSwitcher } from "./floating-view-mode-switcher";
import { MediaTypeFilterToggle, type MediaTypeFilter } from "./media-type-filter";
import { InfiniteMomentGrid, type InfiniteMomentGridHandle } from "./infinite-moment-grid";
import { ImmersiveMomentView } from "./immersive-moment-view";
import { CinemaSlideshow } from "./cinema-mode/cinema-slideshow";
import { useAudioPlayerStore, type AudioTrack, type PlaylistInfo } from "@/lib/stores/audio-player-store";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import type { MomentWithProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface CinemaEventMeta {
  title: string;
  date: string;          // ISO string (starts_at)
  locationName: string | null;
  imageUrl: string | null;
}

interface MomentsViewContainerProps {
  eventId: string;
  eventSlug: string;
  initialMoments: MomentWithProfile[];
  initialHasMore: boolean;
  /** Total number of moments for this event (for showing "X / total" in immersive view) */
  totalCount: number;
  /** Force a specific view on initial load (e.g., from ?view=cinema) */
  initialView?: "immersive" | "cinema";
  /** Event metadata for cinema end card */
  eventMeta?: CinemaEventMeta;
  /** Pre-fetched playlist data (server-side) — skips the client-side RPC call */
  initialPlaylist?: { tracks: AudioTrack[]; playlistInfo: PlaylistInfo } | null;
}

/**
 * Container that manages view mode switching between grid and immersive views.
 * Persists user preference in localStorage.
 */
export function MomentsViewContainer({
  eventId,
  eventSlug,
  initialMoments,
  initialHasMore,
  totalCount,
  initialView,
  eventMeta,
  initialPlaylist,
}: MomentsViewContainerProps) {
  const t = useTranslations("moments");
  const tCommon = useTranslations("common");
  const { viewMode, setViewMode, isLoaded } = useMomentsViewMode("grid");
  const [showImmersive, setShowImmersive] = useState(false);
  const [showCinema, setShowCinema] = useState(false);
  const [immersiveStartIndex, setImmersiveStartIndex] = useState(0);
  const hasAutoOpenedRef = useRef(false);
  const hasAutoPlayedRef = useRef(false);
  const gridRef = useRef<InfiniteMomentGridHandle>(null);

  // Audio player store for auto-play
  const setPlaylist = useAudioPlayerStore((state) => state.setPlaylist);
  const currentPlaylist = useAudioPlayerStore((state) => state.playlist);

  // --- Selection mode state ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- User permissions (for selection mode) ---
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [canModerate, setCanModerate] = useState(false);

  useEffect(() => {
    async function fetchPermissions() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role) {
        setCanModerate(hasRoleLevel(profile.role as UserRole, "moderator"));
      }
    }
    fetchPermissions();
  }, []);

  // Track moments loaded so far (for immersive view to access all loaded moments)
  const [allMoments, setAllMoments] = useState<MomentWithProfile[]>(initialMoments);
  const [hasMoreMoments, setHasMoreMoments] = useState(initialHasMore);

  // Can the user use selection mode? (logged in AND either moderator or has own moments)
  const canSelect = !!currentUserId && (canModerate || allMoments.some(m => m.user_id === currentUserId));

  // Media type filter
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("all");

  // Check if album has videos (to decide whether to show the filter)
  const hasVideos = useMemo(
    () => allMoments.some((m) => m.content_type === "video"),
    [allMoments]
  );

  // Filter moments for immersive view
  const filteredMoments = useMemo(() => {
    if (mediaTypeFilter === "all") return allMoments;
    return allMoments.filter((m) => m.content_type === mediaTypeFilter);
  }, [allMoments, mediaTypeFilter]);

  // Load more moments (called from immersive view when reaching the end)
  const handleLoadMore = useCallback(async () => {
    if (gridRef.current?.hasMore) {
      await gridRef.current.loadMore();
      // Update hasMore state after loading
      setHasMoreMoments(gridRef.current.hasMore);
    }
  }, []);

  // Auto-open cinema mode by default (or immersive if specified via URL)
  useEffect(() => {
    if (isLoaded && !hasAutoOpenedRef.current && allMoments.length > 0) {
      hasAutoOpenedRef.current = true;

      if (initialView === "immersive") {
        setViewMode("immersive");
        setShowImmersive(true);
      } else {
        // Default to cinema mode for the "slideshow" experience
        setViewMode("cinema");
        setShowCinema(true);
      }
    }
  }, [initialView, isLoaded, allMoments.length, setViewMode]);

  // Auto-play event playlist when landing on moments page.
  // Uses server-side pre-fetched data when available (instant), falls back to client RPC.
  useEffect(() => {
    if (hasAutoPlayedRef.current || currentPlaylist?.eventSlug === eventSlug) {
      return;
    }
    hasAutoPlayedRef.current = true;

    // Use pre-fetched playlist (no client RPC delay)
    if (initialPlaylist) {
      setPlaylist(initialPlaylist.tracks, initialPlaylist.playlistInfo, 0);
      return;
    }

    // Fallback: fetch client-side (for cases where initialPlaylist wasn't provided)
    async function fetchAndPlayPlaylist() {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_event_playlist", {
        p_event_slug: eventSlug,
      });

      if (error || !data || data.length === 0) return;

      const firstRow = data[0];
      const tracks: AudioTrack[] = data
        .filter((row: any) => row.track_id !== null)
        .map((row: any) => ({
          id: row.track_id,
          file_url: row.track_file_url,
          title: row.track_title,
          artist: row.track_artist,
          album: row.track_album,
          thumbnail_url: row.track_thumbnail_url,
          duration_seconds: row.track_duration_seconds,
          lyrics_lrc: row.track_lyrics_lrc,
          timing_offset: row.track_timing_offset || 0,
        }));

      if (tracks.length === 0) return;

      setPlaylist(tracks, {
        eventSlug,
        eventTitle: firstRow.event_title,
        eventImageUrl: firstRow.event_image_url,
      }, 0);
    }

    fetchAndPlayPlaylist();
  }, [eventSlug, setPlaylist, currentPlaylist?.eventSlug, initialPlaylist]);

  // Open immersive view starting from a specific moment
  const openImmersive = (index: number = 0) => {
    setImmersiveStartIndex(index);
    setShowImmersive(true);
    setShowCinema(false);
  };

  // Open cinema view — resume music if it was paused (e.g., user closed mini-player)
  const openCinema = () => {
    setShowCinema(true);
    setShowImmersive(false);

    const audio = useAudioPlayerStore.getState();
    if (audio.tracks.length > 0 && !audio.isPlaying) {
      audio.show();
      audio.play();
    }
  };

  // Close immersive view
  const closeImmersive = () => {
    setShowImmersive(false);
  };

  // Close cinema view
  const closeCinema = () => {
    setShowCinema(false);
  };

  // Handle moment deletion from immersive view
  const handleMomentDeleted = useCallback((momentId: string) => {
    setAllMoments((prev) => prev.filter((m) => m.id !== momentId));
  }, []);

  // --- Selection mode handlers ---
  const toggleSelection = useCallback((momentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(momentId)) {
        next.delete(momentId);
      } else {
        next.add(momentId);
      }
      return next;
    });
  }, []);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setSelectedIds(new Set());
    // Force grid view for selection
    setShowImmersive(false);
    setShowCinema(false);
    triggerHaptic("selection");
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    const supabase = createClient();
    let deleted = 0;
    let failed = 0;

    for (const momentId of selectedIds) {
      const moment = allMoments.find(m => m.id === momentId);
      if (!moment) continue;

      const isOwner = moment.user_id === currentUserId;
      const rpcName = isOwner ? "delete_own_moment" : "remove_moment";
      const params = isOwner
        ? { p_moment_id: momentId }
        : { p_moment_id: momentId, p_reason: "Removed by moderator (bulk)" };

      const { data, error } = await supabase.rpc(rpcName, params);
      if (error || !data?.ok) {
        failed++;
      } else {
        deleted++;
      }
    }

    // Remove successfully deleted moments from state
    setAllMoments(prev => prev.filter(m => !selectedIds.has(m.id)));

    if (deleted > 0) {
      triggerHaptic("success");
      toast.success(t("selection.deleted", { count: deleted }));
    }
    if (failed > 0) {
      triggerHaptic("error");
      toast.error(t("selection.deleteFailed", { count: failed }));
    }

    setIsDeleting(false);
    setShowDeleteConfirm(false);
    exitSelectMode();
  }, [selectedIds, allMoments, currentUserId, canModerate, exitSelectMode, t]);

  // Switch from immersive/cinema to grid (and remember preference)
  const switchToGrid = () => {
    setViewMode("grid");
    setShowImmersive(false);
    setShowCinema(false);
  };

  // Switch to immersive view from cinema
  const switchToImmersive = () => {
    setViewMode("immersive");
    setShowCinema(false);
    setShowImmersive(true);
    setImmersiveStartIndex(0);
  };

  // Switch to cinema view from immersive
  const switchToCinema = () => {
    setViewMode("cinema");
    setShowImmersive(false);
    setShowCinema(true);
  };

  // Handle view mode change from switcher
  const handleViewModeChange = (mode: "grid" | "immersive" | "cinema") => {
    setViewMode(mode);
    if (mode === "immersive" && allMoments.length > 0) {
      openImmersive(0);
    } else if (mode === "cinema" && allMoments.length > 0) {
      openCinema();
    } else if (mode === "grid") {
      setShowImmersive(false);
      setShowCinema(false);
    }
  };

  // Don't render until we've loaded the preference from localStorage
  // to avoid flash of wrong view mode
  if (!isLoaded) {
    return (
      <div className="space-y-4">
        {/* Skeleton header */}
        <div className="flex items-center justify-end">
          <div className="h-9 w-32 bg-muted rounded-lg animate-pulse" />
        </div>
        {/* Skeleton grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* View mode switcher, media type filter, and select button */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {selectMode ? (
          <button
            type="button"
            onClick={exitSelectMode}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            {tCommon("cancel")}
          </button>
        ) : (
          <>
            {canSelect && (
              <button
                type="button"
                onClick={enterSelectMode}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted active:scale-95"
              >
                <CheckSquare className="w-4 h-4" />
                {t("selection.select")}
              </button>
            )}
            <MediaTypeFilterToggle
              value={mediaTypeFilter}
              onChange={setMediaTypeFilter}
              hasVideos={hasVideos}
            />
            <ViewModeSwitcher
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          </>
        )}
      </div>

      {/* Grid view (always rendered to maintain scroll position and loaded data) */}
      <div className={(viewMode === "immersive" && showImmersive) || (viewMode === "cinema" && showCinema) ? "hidden" : ""}>
        <InfiniteMomentGrid
          ref={gridRef}
          eventId={eventId}
          eventSlug={eventSlug}
          initialMoments={initialMoments}
          initialHasMore={initialHasMore}
          enableLightbox={viewMode === "grid" && !selectMode}
          onMomentClick={viewMode === "immersive" && !selectMode ? openImmersive : undefined}
          onMomentsUpdate={(moments) => {
            setAllMoments(moments);
            // Keep hasMore in sync with grid
            if (gridRef.current) {
              setHasMoreMoments(gridRef.current.hasMore);
            }
          }}
          mediaTypeFilter={mediaTypeFilter}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onSelectionToggle={toggleSelection}
          currentUserId={currentUserId}
          canModerate={canModerate}
        />
      </div>

      {/* Immersive view (modal overlay) */}
      {showImmersive && (
        <ImmersiveMomentView
          moments={filteredMoments}
          initialIndex={immersiveStartIndex}
          eventId={eventId}
          eventSlug={eventSlug}
          onClose={closeImmersive}
          onSwitchToGrid={switchToGrid}
          onLoadMore={handleLoadMore}
          hasMore={hasMoreMoments}
          totalCount={mediaTypeFilter === "all" ? totalCount : filteredMoments.length}
          onMomentDeleted={handleMomentDeleted}
        />
      )}

      {/* Cinema mode (auto-playing slideshow) */}
      {showCinema && filteredMoments.length > 0 && (
        <CinemaSlideshow
          moments={filteredMoments}
          eventSlug={eventSlug}
          eventMeta={eventMeta}
          totalCount={mediaTypeFilter === "all" ? totalCount : filteredMoments.length}
          hasMore={hasMoreMoments}
          onClose={closeCinema}
          onLoadMore={handleLoadMore}
        />
      )}

      {/* Persistent floating view mode switcher — always visible in fullscreen modes */}
      {(showCinema || showImmersive) && (
        <FloatingViewModeSwitcher
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onClose={switchToGrid}
        />
      )}

      {/* Floating selection action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-background/95 backdrop-blur-md border shadow-lg">
            <span className="text-sm font-medium tabular-nums">
              {t("selection.selected", { count: selectedIds.size })}
            </span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setShowDeleteConfirm(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 active:scale-95 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {t("selection.deleteSelected")}
            </button>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("selection.deleteTitle", { count: selectedIds.size })}
            </DialogTitle>
            <DialogDescription>
              {t("selection.deleteConfirm", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="px-3 py-2"
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="px-3 py-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("selection.deleting")}
                </>
              ) : (
                t("delete")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
