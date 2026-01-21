"use client";

import { useCallback } from "react";
import {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
  X,
  type LucideIcon
} from "lucide-react";
import { TAG_CONFIG, type EventTag, type TagIconName } from "@/lib/constants/event-tags";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<TagIconName, LucideIcon> = {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
};

// Most common/useful tags to show first
const FEATURED_TAGS: EventTag[] = [
  "music", "food", "coffee", "yoga", "art", "workshop",
  "meetup", "party", "hiking", "wellness", "festival"
];

interface TagFilterBarProps {
  selectedTag: EventTag | null;
  onTagChange: (tag: EventTag | null) => void;
  className?: string;
}

export function TagFilterBar({ selectedTag, onTagChange, className }: TagFilterBarProps) {
  const handleTagClick = useCallback((tag: EventTag) => {
    triggerHaptic("selection");
    if (selectedTag === tag) {
      onTagChange(null);
    } else {
      onTagChange(tag);
    }
  }, [selectedTag, onTagChange]);

  const handleClear = useCallback(() => {
    triggerHaptic("selection");
    onTagChange(null);
  }, [onTagChange]);

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* Clear filter button - only show when a tag is selected */}
        {selectedTag && (
          <button
            onClick={handleClear}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-destructive/50 bg-destructive/10 text-destructive text-sm font-medium transition-all active:scale-95"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}

        {/* Featured tags */}
        {FEATURED_TAGS.map((tag) => {
          const config = TAG_CONFIG[tag];
          const IconComponent = ICON_MAP[config.icon];
          const isSelected = selectedTag === tag;

          return (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all active:scale-95",
                isSelected
                  ? "bg-foreground text-background"
                  : "border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <IconComponent className="w-4 h-4" />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Fade gradient on right edge */}
      <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
    </div>
  );
}
