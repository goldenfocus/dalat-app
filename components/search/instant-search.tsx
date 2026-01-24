"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Loader2, MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchSuggestion {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  imageUrl: string | null;
  startsAt: string;
  lifecycle: "upcoming" | "happening" | "past";
}

interface InstantSearchProps {
  className?: string;
  placeholder?: string;
  variant?: "default" | "overlay";
}

function toSearchSlug(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function InstantSearch({
  className,
  placeholder,
  variant = "default",
}: InstantSearchProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const isOverlay = variant === "overlay";
  const listboxId = useId();
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateToEvent = useCallback(
    (slug: string) => {
      setIsOpen(false);
      router.push(`/events/${slug}`);
    },
    [router]
  );

  const navigateToSearch = useCallback(() => {
    if (query.trim()) {
      const slug = toSearchSlug(query);
      if (slug) {
        setIsOpen(false);
        router.push(`/search/${slug}`);
      }
    }
  }, [query, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateToSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          navigateToEvent(suggestions[selectedIndex].slug);
        } else {
          navigateToSearch();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const getLifecycleColor = (lifecycle: string) => {
    switch (lifecycle) {
      case "happening":
        return "text-green-600 dark:text-green-400";
      case "past":
        return "text-muted-foreground";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className={cn("relative", className)}>
      {/* Search Input */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-4 py-2 transition-all",
          isOverlay
            ? "bg-black/30 border-white/20 backdrop-blur-sm focus-within:bg-black/40 focus-within:border-white/40"
            : "bg-muted border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
        )}
      >
        {isLoading ? (
          <Loader2
            className={cn(
              "w-4 h-4 animate-spin shrink-0",
              isOverlay ? "text-white/80" : "text-muted-foreground"
            )}
            aria-hidden="true"
          />
        ) : (
          <Search
            className={cn(
              "w-4 h-4 shrink-0",
              isOverlay ? "text-white/80" : "text-muted-foreground"
            )}
            aria-hidden="true"
          />
        )}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={placeholder ?? t("search.placeholder")}
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={selectedIndex >= 0 ? getOptionId(selectedIndex) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder ?? t("search.placeholder")}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm min-w-0",
            "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
            isOverlay
              ? "text-white placeholder:text-white/60"
              : "text-foreground placeholder:text-muted-foreground"
          )}
        />
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50"
        >
          <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="py-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={getOptionId(index)}
                role="option"
                aria-selected={selectedIndex === index}
              >
                <button
                  onClick={() => navigateToEvent(suggestion.slug)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  tabIndex={-1}
                  className={cn(
                    "w-full px-4 py-3 flex items-start gap-3 text-left transition-colors",
                    selectedIndex === index
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  )}
                >
                  {/* Thumbnail */}
                  {suggestion.imageUrl ? (
                    <img
                      src={suggestion.imageUrl}
                      alt=""
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted shrink-0 flex items-center justify-center" aria-hidden="true">
                      <Calendar className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "font-medium text-sm truncate",
                        getLifecycleColor(suggestion.lifecycle)
                      )}
                    >
                      {suggestion.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{formatDate(suggestion.startsAt)}</span>
                      {suggestion.location && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                            {suggestion.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* View all results */}
          <button
            onClick={navigateToSearch}
            className="w-full px-4 py-3 text-sm text-primary hover:bg-accent/50 border-t border-border flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            {t("search.viewAll", { query })}
          </button>
        </div>
      )}

      {/* No results state */}
      {isOpen && query.length >= 2 && suggestions.length === 0 && !isLoading && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 py-6 text-center text-muted-foreground text-sm">
            <p>{t("search.noResults")}</p>
            <button
              onClick={navigateToSearch}
              className="mt-2 text-primary hover:underline"
            >
              {t("search.searchFor", { query })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
