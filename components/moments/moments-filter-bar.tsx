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
}

export function MomentsFilterBar({
  options,
  activeKey,
  onChange,
}: MomentsFilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      {options.map((option) => {
        const isActive = option.key === activeKey;
        return (
          <button
            key={option.key}
            aria-pressed={isActive}
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onChange(option.key);
            }}
            className={`min-h-11 whitespace-nowrap rounded-pill px-3 py-1.5 text-sm transition-colors ${isActive
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
