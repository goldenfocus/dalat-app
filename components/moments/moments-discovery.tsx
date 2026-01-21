"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Camera, Search } from "lucide-react";
import { MomentsFeed } from "@/components/feed/moments-feed";
import { MomentsFilterBar, type MomentsFilterOption } from "./moments-filter-bar";
import { InfiniteMomentDiscoveryGrouped } from "./infinite-moment-discovery-grouped";
import { MomentsSearch } from "./moments-search";
import { MomentCard } from "./moment-card";
import type { MomentContentType, MomentWithEvent, DiscoveryEventMomentsGroup } from "@/lib/types";

const FILTER_CONFIG: Array<{ key: string; contentTypes: MomentContentType[] }> = [
  { key: "all", contentTypes: ["photo", "video"] },
  { key: "photos", contentTypes: ["photo"] },
  { key: "videos", contentTypes: ["video"] },
];

interface MomentsDiscoveryMobileProps {
  initialMoments: MomentWithEvent[];
  initialHasMore: boolean;
}

interface MomentsDiscoveryDesktopProps {
  initialGroups: DiscoveryEventMomentsGroup[];
  initialHasMore: boolean;
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

export function MomentsDiscoveryMobile({
  initialMoments,
  initialHasMore,
}: MomentsDiscoveryMobileProps) {
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilters();

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Floating filter bar - overlays the video TikTok-style */}
      <div
        className="fixed top-0 left-0 right-0 z-40 pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 pt-3 pb-2 pointer-events-auto">
          <MomentsFilterBar
            options={options}
            activeKey={activeKey}
            onChange={setActiveKey}
            variant="dark"
          />
        </div>
      </div>

      <MomentsFeed
        initialMoments={initialMoments}
        hasMore={initialHasMore}
        contentTypes={activeConfig.contentTypes}
      />
    </div>
  );
}

export function MomentsDiscoveryDesktop({
  initialGroups,
  initialHasMore,
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

          {/* Search results grid */}
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {searchResults.map((moment) => (
                <MomentCard
                  key={moment.id}
                  moment={moment}
                  from="discovery"
                />
              ))}
            </div>
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
    </div>
  );
}
