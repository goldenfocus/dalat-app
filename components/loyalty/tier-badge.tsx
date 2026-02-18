import { cn } from "@/lib/utils";

export const TIER_CONFIG = {
  explorer: {
    label: "Explorer",
    icon: "\u{1F44B}",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    ring: "ring-emerald-500/30",
  },
  local: {
    label: "Local",
    icon: "\u{1F3AF}",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    ring: "ring-blue-500/30",
  },
  insider: {
    label: "Insider",
    icon: "\u2B50",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    ring: "ring-amber-500/30",
  },
  legend: {
    label: "Legend",
    icon: "\u{1F451}",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    ring: "ring-pink-500/30",
  },
} as const;

export type TierKey = keyof typeof TIER_CONFIG;

interface TierBadgeProps {
  tier: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function TierBadge({
  tier,
  size = "md",
  showLabel,
  className,
}: TierBadgeProps) {
  const config = TIER_CONFIG[tier as TierKey] ?? TIER_CONFIG.explorer;

  // Default showLabel based on size if not explicitly set
  const displayLabel = showLabel ?? (size !== "sm");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        config.bg,
        config.border,
        config.color,
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3 py-1.5 text-sm",
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0",
          size === "sm" && "text-xs",
          size === "md" && "text-sm",
          size === "lg" && "text-base",
        )}
        role="img"
        aria-label={config.label}
      >
        {config.icon}
      </span>
      {displayLabel && <span>{config.label}</span>}
    </span>
  );
}
