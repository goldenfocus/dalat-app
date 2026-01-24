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
    <div className="mt-6 flex flex-wrap gap-3">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            href={action.href}
            onClick={() => triggerHaptic("selection")}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-5 py-3 text-sm font-medium text-foreground transition-all hover:bg-amber-500/10 hover:text-amber-700 active:scale-95 dark:hover:bg-amber-400/20 dark:hover:text-amber-300"
          >
            <Icon className="h-4 w-4" />
            <span>{labels[action.key]}</span>
          </Link>
        );
      })}
    </div>
  );
}
