"use client";

import { triggerHaptic } from "@/lib/haptics";

export interface MomentsFilterOption {
  key: string;
  label: string;
}

interface MomentsFilterBarProps {
  options: MomentsFilterOption[];
  activeKey: string;
  onChange: (key: string) => void;
  variant?: "light" | "dark";
}

export function MomentsFilterBar({
  options,
  activeKey,
  onChange,
  variant = "light",
}: MomentsFilterBarProps) {
  const isDark = variant === "dark";

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      {options.map((option) => {
        const isActive = option.key === activeKey;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onChange(option.key);
            }}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all active:scale-95 ${
              isDark
                ? isActive
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
                : isActive
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
