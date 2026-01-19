"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BlogCategory } from "@/lib/types/blog";

interface CategoryTabsProps {
  categories: BlogCategory[];
  activeCategory?: string;
}

export function CategoryTabs({ categories, activeCategory }: CategoryTabsProps) {
  const pathname = usePathname();
  const baseUrl = pathname.split("/blog")[0] + "/blog";

  return (
    <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-4 px-4">
      {/* All posts tab */}
      <Link
        href={baseUrl}
        className={cn(
          "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
          "active:scale-95",
          !activeCategory
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        All
      </Link>

      {/* Category tabs */}
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`${baseUrl}?category=${category.slug}`}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
            "active:scale-95",
            activeCategory === category.slug
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
