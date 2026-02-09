"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import type { BlogPostStatus, BlogPostSource } from "@/lib/types/blog";

interface BlogPostFiltersProps {
  currentStatus: BlogPostStatus | null;
  currentSource: BlogPostSource | null;
}

const STATUS_OPTIONS: { value: BlogPostStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "experimental", label: "Experimental" },
  { value: "published", label: "Published" },
  { value: "deprecated", label: "Deprecated" },
  { value: "archived", label: "Archived" },
];

const SOURCE_OPTIONS: { value: BlogPostSource | ""; label: string }[] = [
  { value: "", label: "All sources" },
  { value: "manual", label: "Manual" },
  { value: "github_release", label: "GitHub Release" },
  { value: "daily_summary", label: "Daily Summary" },
];

export function BlogPostFilters({ currentStatus, currentSource }: BlogPostFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/admin/blog?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("/admin/blog");
  };

  const hasFilters = currentStatus || currentSource;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Filter className="w-4 h-4" />
        <span className="text-sm">Filter:</span>
      </div>

      <select
        value={currentStatus || ""}
        onChange={(e) => updateFilter("status", e.target.value)}
        className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={currentSource || ""}
        onChange={(e) => updateFilter("source", e.target.value)}
        className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
