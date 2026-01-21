"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MomentWithEvent } from "@/lib/types";

interface MomentsSearchProps {
  onResults: (results: MomentWithEvent[] | null, query: string) => void;
  onSearching: (isSearching: boolean) => void;
  className?: string;
}

export function MomentsSearch({ onResults, onSearching, className }: MomentsSearchProps) {
  const t = useTranslations("moments");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onResults(null, "");
      return;
    }

    setIsSearching(true);
    onSearching(true);

    try {
      const response = await fetch(
        `/api/moments/search?q=${encodeURIComponent(searchQuery.trim())}&limit=30`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      onResults(data.results || [], searchQuery);
    } catch (error) {
      console.error("Search error:", error);
      onResults([], searchQuery);
    } finally {
      setIsSearching(false);
      onSearching(false);
    }
  }, [onResults, onSearching]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Clear results if empty
    if (!value.trim()) {
      onResults(null, "");
      return;
    }

    // Debounce search
    debounceRef.current = setTimeout(() => {
      search(value);
    }, 400);
  }, [search, onResults]);

  const handleClear = useCallback(() => {
    setQuery("");
    onResults(null, "");
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, [onResults]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9 pr-20 h-10"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {query && !isSearching && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleClear}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
          <Sparkles className="w-4 h-4 text-primary/50" />
        </div>
      </div>
      {query && !isSearching && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {t("searchHint")}
        </p>
      )}
    </div>
  );
}
