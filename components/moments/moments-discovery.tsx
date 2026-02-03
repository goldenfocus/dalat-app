"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Camera, Search } from "lucide-react";
import { MomentsFeed } from "@/components/feed/moments-feed";
import { MomentsFilterBar, type MomentsFilterOption } from "./moments-filter-bar";
import { InfiniteMomentDiscoveryGrouped } from "./infinite-moment-discovery-grouped";
import { MomentsSearch } from "./moments-search";
import { MomentsSearchOverlay } from "./moments-search-overlay";
import { MomentCard } from "./moment-card";
import { MomentsJoinPill } from "./moments-join-pill";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import type { LightboxMoment } from "./moment-lightbox";
import type { MomentContentType, MomentWithEvent, DiscoveryEventMomentsGroup } from "@/lib/types";

const FILTER_CONFIG: Array<{ key: string; contentTypes: MomentContentType[] }> = [
  { key: "all", contentTypes: ["photo", "video"] },
  { key: "photos", contentTypes: ["photo"] },
  { key: "videos", contentTypes: ["video"] },
];

interface MomentsDiscoveryMobileProps {
  initialMoments: MomentWithEvent[];
  initialHasMore: boolean;
  isAuthenticated?: boolean;
}

interface MomentsDiscoveryDesktopProps {
  initialGroups: DiscoveryEventMomentsGroup[];
  initialHasMore: boolean;
  isAuthenticated?: boolean;
}

function useMomentFilters() {
  const t = useTranslations("moments");
  const [activeKey, setActiveKey] = useState("all");

  const options = useMemo<MomentsFilterOption[]>(
    () => [
      { key: "all", label: t("filters.all") },
      { key: "photos", label: t("filters.photos") },
      { key: "videos", label: t("filters.videos") },
    ],
    [t]
  );

  const activeConfig = useMemo(() => {
    return FILTER_CONFIG.find((filter) => filter.key === activeKey) ?? FILTER_CONFIG[0];
  }, [activeKey]);

  return { options, activeKey, setActiveKey, activeConfig };
}

/** Convert MomentWithEvent to LightboxMoment format (includes event_slug for "Open full page") */
function toLightboxMoments(moments: MomentWithEvent[]): LightboxMoment[] {
  return moments.map(m => ({
    id: m.id,
    content_type: m.content_type,
    media_url: m.media_url,
    text_content: m.text_content,
    cf_video_uid: m.cf_video_uid,
    cf_playback_url: m.cf_playback_url,
    video_status: m.video_status,
    event_slug: m.event_slug,
  }));
}

/** Search results grid with lightbox support */
function SearchResultsGridWithLightbox({ moments }: { moments: MomentWithEvent[] }) {
  const { openLightbox } = useMomentsLightbox();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {moments.map((moment, index) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          eventSlug={moment.event_slug}
          from="discovery"
          onLightboxOpen={() => openLightbox(index)}
        />
      ))}
    </div>
  );
}

export function MomentsDiscoveryMobile({
  initialMoments,
  initialHasMore,
  isAuthenticated = false,
}: MomentsDiscoveryMobileProps) {
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilters();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Floating header bar - overlays the video TikTok-style */}
      <div
        className="fixed top-0 left-0 right-0 z-40 pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Gradient background for better visibility over varied content */}
        <div className="bg-gradient-to-b from-black/60 via-black/30 to-transparent">
          <div className="px-4 pt-3 pb-4 pointer-events-auto flex items-center justify-between gap-3">
            <MomentsFilterBar
              options={options}
              activeKey={activeKey}
              onChange={setActiveKey}
              variant="dark"
            />
            {/* Search button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex-shrink-0 p-2.5 rounded-full bg-white/10 backdrop-blur-sm text-white/90 hover:text-white hover:bg-white/20 active:scale-95 transition-all"
              aria-label="Search moments"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <MomentsFeed
        initialMoments={initialMoments}
        hasMore={initialHasMore}
        contentTypes={activeConfig.contentTypes}
        isAuthenticated={isAuthenticated}
      />

      {/* Search overlay */}
      <MomentsSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}

export function MomentsDiscoveryDesktop({
  initialGroups,
  initialHasMore,
  isAuthenticated = false,
}: MomentsDiscoveryDesktopProps) {
  const t = useTranslations("moments");
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilters();

  // Search state
  const [searchResults, setSearchResults] = useState<MomentWithEvent[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchResults = useCallback((results: MomentWithEvent[] | null, query: string) => {
    setSearchResults(results);
    setSearchQuery(query);
  }, []);

  const handleSearching = useCallback((searching: boolean) => {
    setIsSearching(searching);
  }, []);

  const isShowingSearchResults = searchResults !== null;

  return (
    <div className="space-y-6">
      {/* Header with title and search */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("moments")}</h1>
            <p className="text-muted-foreground">{t("discoverySubtitle")}</p>
          </div>
          <MomentsFilterBar
            options={options}
            activeKey={activeKey}
            onChange={setActiveKey}
          />
        </div>

        {/* Search bar */}
        <MomentsSearch
          onResults={handleSearchResults}
          onSearching={handleSearching}
          className="max-w-md"
        />
      </div>

      {/* Search results or grouped feed */}
      {isShowingSearchResults ? (
        <div className="space-y-4">
          {/* Search results header */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="w-4 h-4" />
            {searchResults.length > 0 ? (
              <span>{t("searchResults", { count: searchResults.length, query: searchQuery })}</span>
            ) : (
              <span>{t("searchNoResults", { query: searchQuery })}</span>
            )}
          </div>

          {/* Search results grid with lightbox */}
          {searchResults.length > 0 ? (
            <MomentsLightboxProvider moments={toLightboxMoments(searchResults)}>
              <SearchResultsGridWithLightbox moments={searchResults} />
            </MomentsLightboxProvider>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t("searchNoResults", { query: searchQuery })}</p>
            </div>
          )}
        </div>
      ) : (
        <InfiniteMomentDiscoveryGrouped
          initialGroups={initialGroups}
          initialHasMore={initialHasMore}
          contentTypes={activeConfig.contentTypes}
        />
      )}

      {/* Floating join pill for anonymous users */}
      {!isAuthenticated && <MomentsJoinPill delay={3000} />}
    </div>
  );
}
