"use client";

import { TAG_CONFIG, type EventTag } from "@/lib/constants/event-tags";

interface TagBadgeProps {
  tag: EventTag;
  size?: "sm" | "md";
  onClick?: () => void;
}

export function TagBadge({ tag, size = "sm", onClick }: TagBadgeProps) {
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
      {config.label}
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
