"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/i18n/routing";
import { TAG_CONFIG, EVENT_TAGS, type EventTag } from "@/lib/constants/event-tags";
import { X } from "lucide-react";

interface TagFilterProps {
  selectedTag?: string;
  tagCounts?: Record<string, number>;
  variant?: "chips" | "dropdown";
}

// Subset of popular tags to show by default
const POPULAR_TAGS: EventTag[] = [
  "music",
  "yoga",
  "food",
  "workshop",
  "meetup",
  "art",
  "festival",
  "outdoor",
  "community",
  "wellness",
];

export function TagFilter({
  selectedTag,
  tagCounts,
  variant = "chips",
}: TagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine which tags to show
  const tagsToShow = tagCounts
    ? // Show tags that have events, sorted by count
      Object.entries(tagCounts)
        .filter(([tag]) => tag in TAG_CONFIG)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([tag]) => tag as EventTag)
    : POPULAR_TAGS;

  const handleTagClick = (tag: EventTag | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (tag === null || tag === selectedTag) {
      params.delete("tag");
    } else {
      params.set("tag", tag);
    }

    // Preserve other params like tab
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-2">
        {selectedTag && selectedTag in TAG_CONFIG && (
          <button
            onClick={() => handleTagClick(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground"
          >
            {TAG_CONFIG[selectedTag as EventTag].label}
            <X className="w-3 h-3" />
          </button>
        )}

        {!selectedTag &&
          tagsToShow.map((tag) => {
            const config = TAG_CONFIG[tag];
            const count = tagCounts?.[tag];

            return (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`
                  inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium
                  transition-colors hover:opacity-80
                  ${config.color}
                `}
              >
                {config.label}
                {count !== undefined && (
                  <span className="opacity-60">({count})</span>
                )}
              </button>
            );
          })}
      </div>
    );
  }

  // Dropdown variant for mobile
  return (
    <select
      value={selectedTag || ""}
      onChange={(e) =>
        handleTagClick(e.target.value ? (e.target.value as EventTag) : null)
      }
      className="px-3 py-2 rounded-lg border bg-background text-sm"
    >
      <option value="">All categories</option>
      {EVENT_TAGS.map((tag) => {
        const config = TAG_CONFIG[tag];
        const count = tagCounts?.[tag];
        return (
          <option key={tag} value={tag}>
            {config.label} {count !== undefined && `(${count})`}
          </option>
        );
      })}
    </select>
  );
}

// Compact pill for mobile overlay UI
export function TagFilterPill({ selectedTag }: { selectedTag?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!selectedTag || !(selectedTag in TAG_CONFIG)) {
    return null;
  }

  const clearTag = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tag");
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const config = TAG_CONFIG[selectedTag as EventTag];

  return (
    <button
      onClick={clearTag}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-black/50 text-white backdrop-blur-sm"
    >
      {config.label}
      <X className="w-3 h-3" />
    </button>
  );
}
