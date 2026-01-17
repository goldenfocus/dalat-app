"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  /** Current search value (controlled) */
  value?: string;
  /** Called when value changes */
  onChange?: (value: string) => void;
  /** Called when clear button is clicked */
  onClear?: () => void;
  /** Show loading spinner instead of search icon */
  isLoading?: boolean;
  /** Visual variant */
  variant?: "default" | "overlay";
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      value,
      onChange,
      onClear,
      isLoading = false,
      variant = "default",
      placeholder = "Search...",
      ...props
    },
    ref
  ) => {
    const isOverlay = variant === "overlay";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    };

    const handleClear = () => {
      onChange?.("");
      onClear?.();
    };

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full transition-all",
          isOverlay
            ? "bg-black/30 backdrop-blur-md border border-white/20 px-3 py-1.5"
            : "bg-muted border border-border px-4 py-2",
          className
        )}
      >
        {isLoading ? (
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
          ref={ref}
          type="search"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm min-w-0",
            // Hide native WebKit clear button (we have our own)
            "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
            isOverlay
              ? "text-white placeholder:text-white/50"
              : "text-foreground placeholder:text-muted-foreground"
          )}
          {...props}
        />
        {value && (
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
    );
  }
);

SearchInput.displayName = "SearchInput";

export { SearchInput };
export type { SearchInputProps };
