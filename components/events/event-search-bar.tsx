"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchInput } from "@/components/ui/search-input";
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
