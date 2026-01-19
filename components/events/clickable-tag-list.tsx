"use client";

import { Link } from "@/lib/i18n/routing";
import { TAG_CONFIG, type EventTag, type TagIconName } from "@/lib/constants/event-tags";
import {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
  type LucideIcon
} from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

// Map icon names to actual components
const ICON_MAP: Record<TagIconName, LucideIcon> = {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
};

interface ClickableTagListProps {
  tags: string[];
  maxDisplay?: number;
}

/**
 * Clickable tag chips that link to tag landing pages.
 * Ghost style with icon + label, touch-friendly (44px min tap target).
 */
export function ClickableTagList({ tags, maxDisplay = 5 }: ClickableTagListProps) {
  const validTags = tags.filter((t): t is EventTag => t in TAG_CONFIG);

  if (validTags.length === 0) return null;

  const displayTags = validTags.slice(0, maxDisplay);

  return (
    <div className="flex flex-wrap gap-2">
      {displayTags.map((tag) => {
        const config = TAG_CONFIG[tag];
        const IconComponent = ICON_MAP[config.icon];
        return (
          <Link
            key={tag}
            href={`/events/tags/${tag}`}
            onClick={() => triggerHaptic("selection")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all touch-manipulation"
          >
            <IconComponent className="w-4 h-4" />
            <span>{config.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
