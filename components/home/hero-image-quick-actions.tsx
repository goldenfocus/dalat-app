"use client";

import { Link } from "@/lib/i18n/routing";
import { Search, MapPin, Calendar, Building2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

const QUICK_ACTIONS = [
  { key: "search", href: "/search", icon: Search },
  { key: "map", href: "/map", icon: MapPin },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "venues", href: "/venues", icon: Building2 },
] as const;

interface HeroImageQuickActionsProps {
  labels: {
    search: string;
    map: string;
    calendar: string;
    venues: string;
  };
}

/**
 * Quick action pills styled for dark background (hero image overlay).
 * Uses semi-transparent white backgrounds with backdrop blur.
 */
export function HeroImageQuickActions({ labels }: HeroImageQuickActionsProps) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            href={action.href}
            onClick={() => triggerHaptic("selection")}
            className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-3 text-sm font-medium text-white transition-all hover:bg-white/30 active:scale-95"
          >
            <Icon className="h-4 w-4" />
            <span>{labels[action.key]}</span>
          </Link>
        );
      })}
    </div>
  );
}
