"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Grid3x3, Calendar, Users } from "lucide-react";

type TabKey = "moments" | "events" | "members";

interface TribeTabsProps {
  /** Omitted when the tribe has no visible moments -- the tab is then not rendered at all. */
  momentsSlot?: React.ReactNode;
  eventsSlot: React.ReactNode;
  /** Omitted for non-members, who can't see the roster. */
  membersSlot?: React.ReactNode;
}

export function TribeTabs({ momentsSlot, eventsSlot, membersSlot }: TribeTabsProps) {
  const t = useTranslations("tribes");

  const tabs: { key: TabKey; icon: React.ReactNode; label: string; content: React.ReactNode }[] = [
    ...(momentsSlot
      ? [{ key: "moments" as const, icon: <Grid3x3 className="w-4 h-4" />, label: t("moments"), content: momentsSlot }]
      : []),
    { key: "events", icon: <Calendar className="w-4 h-4" />, label: t("events"), content: eventsSlot },
    ...(membersSlot
      ? [{ key: "members" as const, icon: <Users className="w-4 h-4" />, label: t("members"), content: membersSlot }]
      : []),
  ];

  // Moments lead when the tribe has a gallery; otherwise the page opens on events.
  const [active, setActive] = useState<TabKey>(tabs[0].key);
  const activeTab = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <div>
      {/* Sticky tab bar -- stays reachable while scrolling a long gallery */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="flex" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.key)}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-3 py-3.5
                  text-sm font-medium border-b-2 -mb-px
                  transition-colors touch-manipulation active:scale-[0.98]
                  ${isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-6">{activeTab.content}</div>
    </div>
  );
}
