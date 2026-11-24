"use client";

import { useMemo, useState, useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import {
  getAppHistoryEntryKey,
  readHistoryEntryValue,
  saveHistoryEntryValue,
  subscribeToAppHistory,
} from "@/lib/navigation-history";
import { MomentsFilterBar, type MomentsFilterOption } from "./moments-filter-bar";
import { InfiniteMomentDiscoveryGrouped } from "./infinite-moment-discovery-grouped";
import { MomentsSearch } from "./moments-search";
import { MomentCard } from "./moment-card";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import type { LightboxMoment } from "./moment-lightbox";
import { DISCOVERY_MEDIA_TYPES, type DiscoveryGallery } from "@/lib/moments/discovery-galleries";
import type { MomentContentType, MomentWithEvent } from "@/lib/types";

const FILTER_CONFIG: Array<{ key: string; contentTypes: MomentContentType[] }> = [
  { key: "all", contentTypes: DISCOVERY_MEDIA_TYPES },
  { key: "photos", contentTypes: ["photo"] },
  { key: "videos", contentTypes: ["video"] },
];

interface MomentsDiscoveryProps {
  initialGroups: DiscoveryGallery[];
  initialHasMore: boolean;
}

function useMomentFilterState() {
  const t = useTranslations("moments");
  const entryKey = useSyncExternalStore(subscribeToAppHistory, getAppHistoryEntryKey, () => undefined);
  const [selection, setSelection] = useState<{ entryKey?: string; filter: string }>();
  const activeKey = selection && selection.entryKey === entryKey
    ? selection.filter
    : (entryKey && readHistoryEntryValue(entryKey, "moments-filter")) || "all";

  function setActiveKey(filter: string) {
    if (entryKey) saveHistoryEntryValue(entryKey, "moments-filter", filter);
    setSelection({ entryKey, filter });
  }

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
    // User info for watermark
    display_name: m.display_name,
    username: m.username,
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

export function MomentsDiscovery({
  initialGroups,
  initialHasMore,
}: MomentsDiscoveryProps) {
  const t = useTranslations("moments");
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilterState();

  // Search state
  const [searchResults, setSearchResults] = useState<MomentWithEvent[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchResults = useCallback((results: MomentWithEvent[] | null, query: string) => {
    setSearchResults(results);
    setSearchQuery(query);
  }, []);

  const isShowingSearchResults = searchResults !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center">
          <h1 className="sr-only">{t("moments")}</h1>
          <MomentsFilterBar
            options={options}
            activeKey={activeKey}
            onChange={setActiveKey}
          />
        </div>
        <MomentsSearch onResults={handleSearchResults} className="sm:max-w-md" />
      </div>

      {isShowingSearchResults ? (
        searchResults.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("searchResults", { count: searchResults.length, query: searchQuery })}
            </p>
            <MomentsLightboxProvider moments={toLightboxMoments(searchResults)}>
              <SearchResultsGridWithLightbox moments={searchResults} />
            </MomentsLightboxProvider>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            <Camera className="mx-auto mb-4 size-10" aria-hidden="true" />
            <p>{t("searchNoResults", { query: searchQuery })}</p>
          </div>
        )
      ) : (
        <InfiniteMomentDiscoveryGrouped
          key={activeKey}
          initialGroups={activeKey === "all" ? initialGroups : []}
          initialHasMore={activeKey === "all" ? initialHasMore : true}
          contentTypes={activeConfig.contentTypes}
        />
      )}
    </div>
  );
}
