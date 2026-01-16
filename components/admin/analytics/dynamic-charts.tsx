"use client";

import dynamic from "next/dynamic";
import type { TimeSeriesDataPoint, RoleDistribution, EventActivityData, RsvpTrendsData } from "@/lib/types";

// Chart skeleton for loading states
function ChartSkeleton({ height = "h-[300px]" }: { height?: string }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-6">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-4 w-48 bg-muted animate-pulse rounded mt-2" />
      </div>
      <div className={`${height} bg-muted/30 animate-pulse rounded`} />
    </div>
  );
}

// Dynamically import chart components to code-split Recharts (~200KB)
export const DynamicUserGrowthChart = dynamic<{ data: TimeSeriesDataPoint[] }>(
  () => import("./user-growth-chart").then((mod) => mod.UserGrowthChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

export const DynamicRoleDistributionChart = dynamic<{ data: RoleDistribution[] }>(
  () => import("./role-distribution-chart").then((mod) => mod.RoleDistributionChart),
  {
    loading: () => <ChartSkeleton height="h-[280px]" />,
    ssr: false,
  }
);

export const DynamicEventActivityChart = dynamic<{ data: EventActivityData[] }>(
  () => import("./event-activity-chart").then((mod) => mod.EventActivityChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

export const DynamicRsvpTrendsChart = dynamic<{ data: RsvpTrendsData[] }>(
  () => import("./rsvp-trends-chart").then((mod) => mod.RsvpTrendsChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);
