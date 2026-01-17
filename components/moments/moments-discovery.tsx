"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MomentsFeed } from "@/components/feed";
import { MomentsFilterBar, type MomentsFilterOption } from "./moments-filter-bar";
import { InfiniteMomentDiscoveryGrid } from "./infinite-moment-discovery-grid";
import type { MomentContentType, MomentLikeStatus, MomentWithEvent } from "@/lib/types";

const FILTER_CONFIG: Array<{ key: string; contentTypes: MomentContentType[] }> = [
  { key: "all", contentTypes: ["photo", "video"] },
  { key: "photos", contentTypes: ["photo"] },
  { key: "videos", contentTypes: ["video"] },
];

interface MomentsDiscoveryProps {
  initialMoments: MomentWithEvent[];
  initialLikes: MomentLikeStatus[];
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
  initialLikes,
  initialHasMore,
}: MomentsDiscoveryProps) {
  const t = useTranslations("moments");
  const { options, activeKey, setActiveKey, activeConfig } = useMomentFilters();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("moments")}</h1>
        </div>
        <div className="px-4 pb-3">
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
        initialLikes={initialLikes}
        hasMore={initialHasMore}
        contentTypes={activeConfig.contentTypes}
      />
    </div>
  );
}

export function MomentsDiscoveryDesktop({
  initialMoments,
  initialLikes,
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
        initialLikes={initialLikes}
        initialHasMore={initialHasMore}
        contentTypes={activeConfig.contentTypes}
      />
    </div>
  );
}
