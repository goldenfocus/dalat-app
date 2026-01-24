"use client";

import { Link } from "@/lib/i18n/routing";
import { MapPin, Calendar, Building2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

const QUICK_ACTIONS = [
  { key: "map", href: "/map", icon: MapPin },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "venues", href: "/venues", icon: Building2 },
] as const;

interface HeroQuickActionsProps {
  labels: {
    map: string;
    calendar: string;
    venues: string;
  };
}

export function HeroQuickActions({ labels }: HeroQuickActionsProps) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            href={action.href}
            onClick={() => triggerHaptic("selection")}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-teal-500/10 hover:text-teal-700 active:scale-95 dark:hover:bg-teal-400/20 dark:hover:text-teal-300"
          >
            <Icon className="h-4 w-4" />
            <span>{labels[action.key]}</span>
          </Link>
        );
      })}
    </div>
  );
}
