"use client";

import dynamic from "next/dynamic";

// Lazy load InstantSearch - saves 8-12KB on mobile where search is hidden
const InstantSearch = dynamic(
  () =>
    import("@/components/search/instant-search").then((mod) => mod.InstantSearch),
  {
    ssr: false,
    loading: () => (
      <div className="h-10 w-64 animate-pulse rounded-full bg-muted" />
    ),
  }
);

interface EventSearchBarProps {
  className?: string;
  variant?: "default" | "overlay";
  placeholder?: string;
}

/**
 * Event search bar with instant search (search-as-you-type)
 * Shows dropdown with matching events as user types
 * Lazy-loaded to reduce initial JS bundle on mobile
 */
export function EventSearchBar({
  className,
  variant = "default",
  placeholder,
}: EventSearchBarProps) {
  return (
    <InstantSearch
      className={className}
      variant={variant}
      placeholder={placeholder}
    />
  );
}
