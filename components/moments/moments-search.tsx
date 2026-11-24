"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MomentWithEvent } from "@/lib/types";

interface MomentsSearchProps {
  onResults: (results: MomentWithEvent[] | null, query: string) => void;
  className?: string;
}

export function MomentsSearch({ onResults, className }: MomentsSearchProps) {
  const t = useTranslations("moments");
  const tCommon = useTranslations("common");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    const request = new AbortController();
    requestRef.current = request;
    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/moments/search?q=${encodeURIComponent(searchQuery.trim())}&limit=30`,
        { signal: request.signal }
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      if (!request.signal.aborted) onResults(data.results || [], searchQuery);
    } catch (error) {
      if (request.signal.aborted) return;
      console.error("Search error:", error);
      onResults([], searchQuery);
    } finally {
      if (!request.signal.aborted) setIsSearching(false);
    }
  }, [onResults]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    requestRef.current?.abort();
    setIsSearching(false);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
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
          aria-label={t("searchMoments")}
          className="pl-9 pr-14 h-11"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {query && !isSearching && (
            <Button
              variant="ghost"
              size="sm"
              className="size-10 p-0"
              aria-label={tCommon("close")}
              onClick={() => handleChange("")}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
