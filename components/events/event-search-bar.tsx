"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface EventSearchBarProps {
  className?: string;
  variant?: "default" | "overlay";
  placeholder?: string;
}

export function EventSearchBar({
  className,
  variant = "default",
  placeholder,
}: EventSearchBarProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams(searchParams.toString());

    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }

    // Keep the tab parameter if present
    const url = params.toString() ? `/?${params.toString()}` : "/";

    startTransition(() => {
      router.push(url);
    });
  };

  const handleClear = () => {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const url = params.toString() ? `/?${params.toString()}` : "/";

    startTransition(() => {
      router.push(url);
    });
  };

  const isOverlay = variant === "overlay";

  return (
    <form onSubmit={handleSearch} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-full transition-all",
          isOverlay
            ? "bg-black/30 backdrop-blur-md border border-white/20 px-3 py-1.5"
            : "bg-muted border border-border px-4 py-2"
        )}
      >
        {isPending ? (
          <Loader2
            className={cn(
              "w-4 h-4 animate-spin flex-shrink-0",
              isOverlay ? "text-white/70" : "text-muted-foreground"
            )}
          />
        ) : (
          <Search
            className={cn(
              "w-4 h-4 flex-shrink-0",
              isOverlay ? "text-white/70" : "text-muted-foreground"
            )}
          />
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? t("search.placeholder")}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm min-w-0",
            isOverlay
              ? "text-white placeholder:text-white/50"
              : "text-foreground placeholder:text-muted-foreground"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "flex-shrink-0 p-0.5 rounded-full transition-colors",
              isOverlay
                ? "text-white/70 hover:text-white hover:bg-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
