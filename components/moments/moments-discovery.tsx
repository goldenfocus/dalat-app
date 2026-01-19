"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MomentsFeed } from "@/components/feed/moments-feed";
import { MomentsFilterBar, type MomentsFilterOption } from "./moments-filter-bar";
import { InfiniteMomentDiscoveryGrid } from "./infinite-moment-discovery-grid";
import type { MomentContentType, MomentWithEvent } from "@/lib/types";

const FILTER_CONFIG: Array<{ key: string; contentTypes: MomentContentType[] }> = [
  { key: "all", contentTypes: ["photo", "video"] },
  { key: "photos", contentTypes: ["photo"] },
  { key: "videos", contentTypes: ["video"] },
];

interface MomentsDiscoveryProps {
  initialMoments: MomentWithEvent[];
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
}: MomentsDiscoveryProps) {
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
  initialMoments,
  initialHasMore,
}: MomentsDiscoveryProps) {
  const t = useTranslations("moments");
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilters();

  return (
    <div className="space-y-6">
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

      <InfiniteMomentDiscoveryGrid
        initialMoments={initialMoments}
        initialHasMore={initialHasMore}
        contentTypes={activeConfig.contentTypes}
      />
    </div>
  );
}
