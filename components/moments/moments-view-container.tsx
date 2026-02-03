"use client";

import { useState } from "react";
import { useMomentsViewMode } from "@/lib/hooks/use-moments-view-mode";
import { ViewModeSwitcher } from "./view-mode-switcher";
import { InfiniteMomentGrid } from "./infinite-moment-grid";
import { ImmersiveMomentView } from "./immersive-moment-view";
import type { MomentWithProfile } from "@/lib/types";

interface MomentsViewContainerProps {
  eventId: string;
  eventSlug: string;
  initialMoments: MomentWithProfile[];
  initialHasMore: boolean;
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
}: MomentsViewContainerProps) {
  const { viewMode, setViewMode, isLoaded } = useMomentsViewMode("grid");
  const [showImmersive, setShowImmersive] = useState(false);
  const [immersiveStartIndex, setImmersiveStartIndex] = useState(0);

  // Track moments loaded so far (for immersive view to access all loaded moments)
  const [allMoments, setAllMoments] = useState<MomentWithProfile[]>(initialMoments);

  // Open immersive view starting from a specific moment
  const openImmersive = (index: number = 0) => {
    setImmersiveStartIndex(index);
    setShowImmersive(true);
  };

  // Close immersive view
  const closeImmersive = () => {
    setShowImmersive(false);
  };

  // Switch from immersive to grid (and remember preference)
  const switchToGrid = () => {
    setViewMode("grid");
    setShowImmersive(false);
  };

  // If user preference is immersive, show the button to enter immersive mode
  // rather than auto-opening (to avoid jarring UX on page load)
  const handleViewModeChange = (mode: "grid" | "immersive") => {
    setViewMode(mode);
    if (mode === "immersive" && allMoments.length > 0) {
      openImmersive(0);
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
      {/* View mode switcher */}
      <div className="flex items-center justify-end mb-4">
        <ViewModeSwitcher
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
      </div>

      {/* Grid view (always rendered to maintain scroll position and loaded data) */}
      <div className={viewMode === "immersive" && showImmersive ? "hidden" : ""}>
        <InfiniteMomentGrid
          eventId={eventId}
          eventSlug={eventSlug}
          initialMoments={initialMoments}
          initialHasMore={initialHasMore}
          enableLightbox={viewMode === "grid"}
          onMomentClick={viewMode === "immersive" ? openImmersive : undefined}
          onMomentsUpdate={setAllMoments}
        />
      </div>

      {/* Immersive view (modal overlay) */}
      {showImmersive && allMoments.length > 0 && (
        <ImmersiveMomentView
          moments={allMoments}
          initialIndex={immersiveStartIndex}
          eventSlug={eventSlug}
          onClose={closeImmersive}
          onSwitchToGrid={switchToGrid}
        />
      )}
    </>
  );
}
