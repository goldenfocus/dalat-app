"use client";

import { InstantSearch } from "@/components/search/instant-search";

interface EventSearchBarProps {
  className?: string;
  variant?: "default" | "overlay";
  placeholder?: string;
}

/**
 * Event search bar with instant search (search-as-you-type)
 * Shows dropdown with matching events as user types
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
