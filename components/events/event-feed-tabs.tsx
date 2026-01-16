"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
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
  { id: "upcoming", icon: Calendar, defaultLabel: "Upcoming" },
  { id: "happening", icon: Radio, defaultLabel: "Now" },
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
      if (tab === "upcoming") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.push(query ? `?${query}` : "/", { scroll: false });
    }
    onTabChange?.(tab);
  };

  return (
    <div
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
            <Icon className={cn("h-4 w-4", tab.id === "happening" && isActive && "animate-pulse")} />
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

        // Past tab navigates to archive page instead of query param
        if (tab.id === "past") {
          return (
            <Link
              key={tab.id}
              href="/events/this-month"
              onClick={() => onTabChange?.("past")}
              className={tabClassName}
            >
              {tabContent}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
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
