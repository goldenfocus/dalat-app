"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { SafeResponsiveContainer } from "./safe-responsive-container";
import type { RsvpTrendsData } from "@/lib/types";

interface RsvpTrendsChartProps {
  data: RsvpTrendsData[];
}

export function RsvpTrendsChart({ data }: RsvpTrendsChartProps) {
  // Format date for display
  const formattedData = data.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  // Calculate totals
  const totals = data.reduce(
    (acc, point) => ({
      going: acc.going + point.going,
      waitlist: acc.waitlist + point.waitlist,
      interested: acc.interested + point.interested,
    }),
    { going: 0, waitlist: 0, interested: 0 }
  );

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">RSVP Trends</h3>
        <p className="text-sm text-muted-foreground">
          {totals.going} going, {totals.waitlist} waitlist, {totals.interested}{" "}
          interested
        </p>
      </div>
      <div className="h-[300px]">
        {data.length > 0 ? (
          <SafeResponsiveContainer>
            <AreaChart data={formattedData}>
              <defs>
                <linearGradient id="goingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="waitlistGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="interestedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="going"
                name="Going"
                stackId="1"
                stroke="hsl(var(--chart-3))"
                fill="url(#goingGradient)"
              />
              <Area
                type="monotone"
                dataKey="waitlist"
                name="Waitlist"
                stackId="1"
                stroke="hsl(var(--chart-4))"
                fill="url(#waitlistGradient)"
              />
              <Area
                type="monotone"
                dataKey="interested"
                name="Interested"
                stackId="1"
                stroke="hsl(var(--chart-5))"
                fill="url(#interestedGradient)"
              />
            </AreaChart>
          </SafeResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
