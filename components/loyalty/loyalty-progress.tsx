"use client";

import { cn } from "@/lib/utils";
import { TierBadge, TIER_CONFIG, type TierKey } from "./tier-badge";

const TIER_THRESHOLDS: Record<TierKey, number> = {
  explorer: 0,
  local: 100,
  insider: 500,
  legend: 2000,
};

const TIER_ORDER: TierKey[] = ["explorer", "local", "insider", "legend"];

function getNextTier(tier: TierKey): TierKey | null {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

function getProgressPercent(
  currentPoints: number,
  currentTier: TierKey,
): number {
  const nextTier = getNextTier(currentTier);
  if (!nextTier) return 100;

  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const range = nextThreshold - currentThreshold;

  if (range <= 0) return 100;
  return Math.min(
    100,
    Math.max(0, ((currentPoints - currentThreshold) / range) * 100),
  );
}

// Tailwind gradient classes per tier
const TIER_GRADIENT: Record<TierKey, string> = {
  explorer: "from-emerald-500 to-emerald-400",
  local: "from-blue-500 to-blue-400",
  insider: "from-amber-500 to-amber-400",
  legend: "from-pink-500 via-amber-400 to-pink-500",
};

interface LoyaltyProgressProps {
  currentPoints: number;
  currentTier: string;
  className?: string;
}

export function LoyaltyProgress({
  currentPoints,
  currentTier,
  className,
}: LoyaltyProgressProps) {
  const tier = (
    TIER_ORDER.includes(currentTier as TierKey) ? currentTier : "explorer"
  ) as TierKey;
  const nextTier = getNextTier(tier);
  const progress = getProgressPercent(currentPoints, tier);
  const isMaxTier = !nextTier;

  const pointsToNext = nextTier
    ? Math.max(0, TIER_THRESHOLDS[nextTier] - currentPoints)
    : 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header: current tier + points */}
      <div className="flex items-center justify-between">
        <TierBadge tier={tier} size="md" />
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            TIER_CONFIG[tier].color,
          )}
        >
          {currentPoints.toLocaleString()} pts
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out",
            TIER_GRADIENT[tier],
            isMaxTier && "animate-pulse",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Footer: next tier info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {isMaxTier ? (
          <span className="font-medium text-amber-500">
            Max tier reached!
          </span>
        ) : (
          <>
            <span>
              {pointsToNext.toLocaleString()} more pts to{" "}
              <span className={cn("font-medium", TIER_CONFIG[nextTier].color)}>
                {TIER_CONFIG[nextTier].label}
              </span>
            </span>
            <TierBadge tier={nextTier} size="sm" showLabel={false} />
          </>
        )}
      </div>
    </div>
  );
}
