"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { cn } from "@/lib/utils";

/**
 * Compact theme toggle for the header.
 * Shows sun/moon icon, opens popover with full theme selector on click.
 */
export function ThemeToggle() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine if we're in a "light" theme
  const isLight = resolvedTheme === "light";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label="Change theme"
        >
          {mounted ? (
            isLight ? (
              <Sun className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Moon className="w-5 h-5" aria-hidden="true" />
            )
          ) : (
            // Placeholder during hydration to prevent layout shift
            <div className="w-5 h-5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] sm:w-[400px] p-4"
        align="end"
        sideOffset={8}
      >
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Choose your vibe</h3>
          <ThemeSelector />
        </div>
      </PopoverContent>
    </Popover>
  );
}
