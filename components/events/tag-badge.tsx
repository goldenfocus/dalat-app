"use client";

import { useTranslations } from "next-intl";
import { TAG_CONFIG, type EventTag, type TagIconName } from "@/lib/constants/event-tags";
import {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake, CircleDot,
  type LucideIcon
} from "lucide-react";

// Map icon names to actual components
const ICON_MAP: Record<TagIconName, LucideIcon> = {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake, CircleDot,
};

interface TagBadgeProps {
  tag: EventTag;
  size?: "sm" | "md";
  onClick?: () => void;
}

export function TagBadge({ tag, size = "sm", onClick }: TagBadgeProps) {
  const t = useTranslations("eventTags");
  const config = TAG_CONFIG[tag];
  if (!config) return null;

  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-xs px-2 py-1";

  const Component = onClick ? "button" : "span";

  return (
    <Component
      onClick={onClick}
      className={`
        inline-flex items-center rounded-full font-medium
        ${config.color}
        ${sizeClasses}
        ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
      `}
    >
      {t(tag)}
    </Component>
  );
}

interface TagListProps {
  tags: string[];
  maxDisplay?: number;
  size?: "sm" | "md";
  onTagClick?: (tag: EventTag) => void;
}

export function TagList({ tags, maxDisplay = 3, size = "sm", onTagClick }: TagListProps) {
  // Filter to only valid tags
  const validTags = tags.filter((t): t is EventTag => t in TAG_CONFIG);

  if (validTags.length === 0) return null;

  const displayTags = validTags.slice(0, maxDisplay);
  const remainingCount = validTags.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1">
      {displayTags.map((tag) => (
        <TagBadge
          key={tag}
          tag={tag}
          size={size}
          onClick={onTagClick ? () => onTagClick(tag) : undefined}
        />
      ))}
      {remainingCount > 0 && (
        <span className="text-[10px] text-muted-foreground self-center">
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

// Icon-only tag display for minimal UI
interface IconTagListProps {
  tags: string[];
  maxDisplay?: number;
}

export function IconTagList({ tags, maxDisplay = 4 }: IconTagListProps) {
  const t = useTranslations("eventTags");
  const validTags = tags.filter((tag): tag is EventTag => tag in TAG_CONFIG);

  if (validTags.length === 0) return null;

  const displayTags = validTags.slice(0, maxDisplay);
  const remainingCount = validTags.length - maxDisplay;

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {displayTags.map((tag) => {
        const config = TAG_CONFIG[tag];
        const IconComponent = ICON_MAP[config.icon];
        return (
          <span key={tag} title={t(tag)}>
            <IconComponent className="w-3.5 h-3.5" />
          </span>
        );
      })}
      {remainingCount > 0 && (
        <span className="text-[10px]">+{remainingCount}</span>
      )}
    </div>
  );
}
