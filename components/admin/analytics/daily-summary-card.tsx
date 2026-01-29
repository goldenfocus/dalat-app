"use client";

import {
  UserPlus,
  Download,
  CalendarPlus,
  PartyPopper,
  MessageSquare,
  Camera,
} from "lucide-react";
import type { DailySummary } from "@/lib/admin/analytics";

interface DailySummaryCardProps {
  data: DailySummary;
}

export function DailySummaryCard({ data }: DailySummaryCardProps) {
  const stats = [
    {
      label: "New Users",
      value: data.newUsers,
      icon: UserPlus,
      color: "text-green-500",
    },
    {
      label: "Scraped",
      value: data.eventsScraped,
      icon: Download,
      color: "text-blue-500",
    },
    {
      label: "Created",
      value: data.eventsCreated,
      icon: CalendarPlus,
      color: "text-purple-500",
    },
    {
      label: "RSVPs",
      value: data.rsvpsToday,
      icon: PartyPopper,
      color: "text-orange-500",
    },
    {
      label: "Comments",
      value: data.commentsToday,
      icon: MessageSquare,
      color: "text-pink-500",
    },
    {
      label: "Moments",
      value: data.momentsToday,
      icon: Camera,
      color: "text-cyan-500",
    },
  ];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Today&apos;s Activity</h2>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="flex items-center justify-center mb-1">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
