"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";

interface EventSearchBarProps {
  className?: string;
  variant?: "default" | "overlay";
  placeholder?: string;
}

/**
 * Convert search query to URL-friendly slug
 * "Cherry Blossom" → "cherry-blossom"
 */
function toSearchSlug(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function EventSearchBar({
  className,
  variant = "default",
  placeholder,
}: EventSearchBarProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Extract current query from pathname if on search page
  const searchMatch = pathname.match(/\/search\/([^/]+)/);
  const initialQuery = searchMatch
    ? decodeURIComponent(searchMatch[1]).replace(/-/g, " ")
    : "";
  const [query, setQuery] = useState(initialQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (query.trim()) {
      const slug = toSearchSlug(query);
      if (slug) {
        startTransition(() => {
          router.push(`/search/${slug}`);
        });
      }
    } else {
      // Empty search goes to home
      startTransition(() => {
        router.push("/");
      });
    }
  };

  const handleClear = () => {
    setQuery("");
    startTransition(() => {
      router.push("/");
    });
  };

  return (
    <form onSubmit={handleSearch} className={cn("relative", className)}>
      <SearchInput
        value={query}
        onChange={setQuery}
        onClear={handleClear}
        isLoading={isPending}
        variant={variant}
        placeholder={placeholder ?? t("search.placeholder")}
      />
    </form>
  );
}
