"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { SafeResponsiveContainer } from "./safe-responsive-container";
import type { RoleDistribution } from "@/lib/types";

interface RoleDistributionChartProps {
  data: RoleDistribution[];
}

// Role display names
const ROLE_LABELS: Record<string, string> = {
  user: "Users",
  admin: "Admins",
  moderator: "Moderators",
  organizer_verified: "Verified Organizers",
  organizer_pending: "Pending Organizers",
  contributor: "Contributors",
};

// Chart colors using CSS variables
const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

export function RoleDistributionChart({ data }: RoleDistributionChartProps) {
  // Format data for display
  const formattedData = data.map((item, index) => ({
    ...item,
    name: ROLE_LABELS[item.role] || item.role,
    color: COLORS[index % COLORS.length],
  }));

  // Calculate total
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Role Distribution</h3>
        <p className="text-sm text-muted-foreground">{total} total users</p>
      </div>
      <div className="h-[200px]">
        {data.length > 0 ? (
          <SafeResponsiveContainer>
            <PieChart>
              <Pie
                data={formattedData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
              >
                {formattedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                formatter={(value: number | undefined, name: string | undefined) => [
                  `${value ?? 0} (${(((value ?? 0) / total) * 100).toFixed(1)}%)`,
                  name ?? "",
                ]}
              />
            </PieChart>
          </SafeResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {formattedData.slice(0, 6).map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className="font-medium">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
