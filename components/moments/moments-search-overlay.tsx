"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2, Sparkles, Camera, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MomentCard } from "./moment-card";
import type { MomentWithEvent } from "@/lib/types";

interface MomentsSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MomentsSearchOverlay({ isOpen, onClose }: MomentsSearchOverlayProps) {
  const t = useTranslations("moments");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MomentWithEvent[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/moments/search?q=${encodeURIComponent(searchQuery.trim())}&limit=30`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setResults(data.results || []);
      setHasSearched(true);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      setResults(null);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      search(value);
    }, 400);
  }, [search]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults(null);
    setHasSearched(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    inputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setQuery("");
    setResults(null);
    setHasSearched(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onClose();
  }, [onClose]);

  // Handle escape key and body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 100);

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") handleClose();
      };
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, handleClose]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header with search input */}
      <div className="flex-shrink-0 px-4 pt-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 -ml-2 rounded-lg text-white/70 hover:text-white active:scale-95 transition-all"
            aria-label="Close search"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9 pr-16 h-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearching && (
                <Loader2 className="w-4 h-4 animate-spin text-white/50" />
              )}
              {query && !isSearching && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={handleClear}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
              <Sparkles className="w-4 h-4 text-primary/70" />
            </div>
          </div>
        </div>

        {/* AI search hint */}
        {query && !isSearching && (
          <p className="text-xs text-white/50 mt-2 flex items-center gap-1 ml-10">
            <Sparkles className="w-3 h-3" />
            {t("searchHint")}
          </p>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {/* Initial state - show prompt */}
        {!hasSearched && !query && (
          <div className="flex flex-col items-center justify-center h-full text-white/50 px-8">
            <Search className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center text-sm">
              {t("searchPrompt")}
            </p>
          </div>
        )}

        {/* Searching state */}
        {isSearching && (
          <div className="flex flex-col items-center justify-center h-full text-white/50">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="text-sm">{t("searching")}</p>
          </div>
        )}

        {/* Results */}
        {!isSearching && hasSearched && results && (
          <div className="p-4">
            {/* Results count */}
            <p className="text-sm text-white/50 mb-4">
              {results.length > 0
                ? t("searchResults", { count: results.length, query })
                : t("searchNoResults", { query })}
            </p>

            {results.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {results.map((moment) => (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    from="discovery"
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-white/50">
                <Camera className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-center text-sm px-8">
                  {t("searchNoResultsHint")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
