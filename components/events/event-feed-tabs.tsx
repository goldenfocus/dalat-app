"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Calendar, Radio, History } from "lucide-react";

export type EventLifecycle = "upcoming" | "happening" | "past";

interface EventFeedTabsProps {
  activeTab: EventLifecycle;
  onTabChange?: (tab: EventLifecycle) => void;
  counts?: { upcoming: number; happening: number; past: number };
  variant?: "default" | "floating";
  labels?: { upcoming: string; happening: string; past: string };
  useUrlNavigation?: boolean;
  hideEmptyTabs?: boolean;
}

const tabs: { id: EventLifecycle; icon: typeof Calendar; defaultLabel: string }[] = [
  { id: "happening", icon: Radio, defaultLabel: "Now" },
  { id: "upcoming", icon: Calendar, defaultLabel: "Upcoming" },
  { id: "past", icon: History, defaultLabel: "Past" },
];

export function EventFeedTabs({
  activeTab,
  onTabChange,
  counts,
  variant = "default",
  labels,
  useUrlNavigation = false,
  hideEmptyTabs = false,
}: EventFeedTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFloating = variant === "floating";

  // Filter out tabs with no events when hideEmptyTabs is enabled
  // Only hide "happening" tab when empty - always show upcoming and past
  const visibleTabs = hideEmptyTabs
    ? tabs.filter((tab) => tab.id !== "happening" || (counts?.happening ?? 0) > 0)
    : tabs;

  const handleTabChange = (tab: EventLifecycle) => {
    if (useUrlNavigation) {
      const params = new URLSearchParams(searchParams.toString());
      // Always include tab param since default can vary based on live events
      params.set("tab", tab);
      router.push(`?${params.toString()}`, { scroll: false });
    }
    onTabChange?.(tab);
  };

  return (
    <div
      role="tablist"
      aria-label="Event filter"
      className={cn(
        "grid w-full gap-1 rounded-lg p-1",
        visibleTabs.length === 2 ? "grid-cols-2" : "grid-cols-3",
        isFloating
          ? "bg-black/40 backdrop-blur-md"
          : "bg-muted"
      )}
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const count = counts?.[tab.id];
        const label = labels?.[tab.id] ?? tab.defaultLabel;

        const tabClassName = cn(
          "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all",
          "active:scale-95",
          isFloating
            ? isActive
              ? "bg-white/20 text-white shadow-sm"
              : "text-white/70 hover:text-white"
            : isActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
        );

        const tabContent = (
          <>
            <Icon className={cn("h-4 w-4", tab.id === "happening" && isActive && "animate-pulse")} aria-hidden="true" />
            <span>{label}</span>
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  "ml-0.5 text-xs",
                  isFloating
                    ? "text-white/50"
                    : "text-muted-foreground"
                )}
              >
                ({count})
              </span>
            )}
          </>
        );

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabChange(tab.id)}
            className={tabClassName}
          >
            {tabContent}
          </button>
        );
      })}
    </div>
  );
}
