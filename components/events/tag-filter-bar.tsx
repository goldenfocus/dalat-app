"use client";

import { useCallback } from "react";
import {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
  SlidersHorizontal, Check, X,
  type LucideIcon
} from "lucide-react";
import { TAG_CONFIG, type EventTag, type TagIconName } from "@/lib/constants/event-tags";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICON_MAP: Record<TagIconName, LucideIcon> = {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
};

// Most common/useful tags to show in the dropdown
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
  const handleTagClick = useCallback((tag: EventTag | null) => {
    triggerHaptic("selection");
    onTagChange(tag);
  }, [onTagChange]);

  const handleClear = useCallback(() => {
    triggerHaptic("selection");
    onTagChange(null);
  }, [onTagChange]);

  const selectedConfig = selectedTag ? TAG_CONFIG[selectedTag] : null;
  const SelectedIcon = selectedConfig ? ICON_MAP[selectedConfig.icon] : null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all active:scale-95",
              selectedTag
                ? "bg-foreground/10 text-foreground border border-foreground/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {selectedTag && SelectedIcon ? (
              <SelectedIcon className="w-4 h-4" />
            ) : (
              <SlidersHorizontal className="w-4 h-4" />
            )}
            <span>
              {selectedTag ? selectedConfig?.label : "Filter"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          {/* All events option */}
          <DropdownMenuItem
            onClick={() => handleTagClick(null)}
            className="py-2.5 px-3 cursor-pointer"
          >
            <span className="flex-1">All Events</span>
            {selectedTag === null && <Check className="w-4 h-4 ml-2" />}
          </DropdownMenuItem>

          {/* Tag options */}
          {FEATURED_TAGS.map((tag) => {
            const config = TAG_CONFIG[tag];
            const IconComponent = ICON_MAP[config.icon];
            const isSelected = selectedTag === tag;

            return (
              <DropdownMenuItem
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="py-2.5 px-3 cursor-pointer"
              >
                <IconComponent className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-1">{config.label}</span>
                {isSelected && <Check className="w-4 h-4 ml-2" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear button when filter is active */}
      {selectedTag && (
        <button
          onClick={handleClear}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95"
          aria-label="Clear filter"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
