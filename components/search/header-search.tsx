"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Loader2, MapPin, Calendar } from "lucide-react";
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

/**
 * Expandable search for the site header.
 * Shows a magnifying glass icon that expands into a Google-style omnibox overlay.
 */
export function HeaderSearch() {
  const t = useTranslations("home");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);

  const listboxId = useId();
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;

  // Ensure portal renders only on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure the element is visible
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
        setShowSuggestions(false);
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowSuggestions(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const navigateToEvent = useCallback(
    (slug: string) => {
      setIsOpen(false);
      setQuery("");
      setShowSuggestions(false);
      router.push(`/events/${slug}`);
    },
    [router]
  );

  const navigateToSearch = useCallback(() => {
    if (query.trim()) {
      const slug = toSearchSlug(query);
      if (slug) {
        setIsOpen(false);
        setQuery("");
        setShowSuggestions(false);
        router.push(`/search/${slug}`);
      }
    }
  }, [query, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
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

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
    setShowSuggestions(false);
  };

  // Search icon button (always visible in header)
  const searchButton = (
    <button
      onClick={handleOpen}
      className="flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
      aria-label={t("search.placeholder")}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
    >
      <Search className="w-5 h-5" aria-hidden="true" />
    </button>
  );

  // Full-screen overlay with search
  const overlay = mounted
    ? createPortal(
        <div
          className={cn(
            "fixed inset-0 z-[100] transition-all duration-200",
            isOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/95 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Search container */}
          <div
            ref={containerRef}
            className={cn(
              "relative w-full max-w-2xl mx-auto px-4 pt-4 transition-all duration-200",
              isOpen ? "translate-y-0" : "-translate-y-4"
            )}
          >
            {/* Search input bar */}
            <div className="flex items-center gap-3 bg-card border border-border rounded-2xl shadow-lg px-4 py-3">
              {isLoading ? (
                <Loader2
                  className="w-5 h-5 text-muted-foreground animate-spin shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="w-5 h-5 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              )}
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-label={t("search.placeholder")}
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-controls={listboxId}
                aria-activedescendant={
                  selectedIndex >= 0 ? getOptionId(selectedIndex) : undefined
                }
                aria-autocomplete="list"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("search.placeholder")}
                className="flex-1 bg-transparent outline-none text-base min-w-0 text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
              />
              <button
                onClick={handleClose}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label="Search suggestions"
                  className="py-1"
                >
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
                          <div
                            className="w-12 h-12 rounded-lg bg-muted shrink-0 flex items-center justify-center"
                            aria-hidden="true"
                          >
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
                                  <MapPin
                                    className="w-3 h-3 shrink-0"
                                    aria-hidden="true"
                                  />
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
            {showSuggestions &&
              query.length >= 2 &&
              suggestions.length === 0 &&
              !isLoading && (
                <div className="mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
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
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {searchButton}
      {overlay}
    </>
  );
}
