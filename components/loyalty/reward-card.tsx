"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TIER_CONFIG, type TierKey } from "./tier-badge";
import {
  Gift,
  Lock,
  Loader2,
  Package,
  Sparkles,
} from "lucide-react";

const TIER_ORDER: TierKey[] = ["explorer", "local", "insider", "legend"];

function meetsMinTier(userTier: string, minTier: string | null): boolean {
  if (!minTier) return true;
  const userIdx = TIER_ORDER.indexOf(userTier as TierKey);
  const minIdx = TIER_ORDER.indexOf(minTier as TierKey);
  return userIdx >= minIdx;
}

type RewardCategory =
  | "experiential"
  | "transactional"
  | "digital"
  | "social"
  | "exclusive";

const CATEGORY_STYLES: Record<
  RewardCategory,
  { label: string; color: string; bg: string; border: string }
> = {
  experiential: {
    label: "Experiential",
    color: "text-purple-600",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  transactional: {
    label: "Transactional",
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  digital: {
    label: "Digital",
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  social: {
    label: "Social",
    color: "text-pink-600",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
  exclusive: {
    label: "Exclusive",
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
};

interface Reward {
  id: string;
  name: string;
  description: string | null;
  category: RewardCategory;
  pointsCost: number;
  minTier: string | null;
  isActive: boolean;
  stockQuantity: number | null;
  partnerName?: string | null;
  partnerLogoUrl?: string | null;
}

interface RewardCardProps {
  reward: Reward;
  userPoints: number;
  userTier: string;
  onClaim?: (rewardId: string) => void;
}

export function RewardCard({
  reward,
  userPoints,
  userTier,
  onClaim,
}: RewardCardProps) {
  const [isClaiming, setIsClaiming] = useState(false);

  const hasEnoughPoints = userPoints >= reward.pointsCost;
  const hasTier = meetsMinTier(userTier, reward.minTier);
  const inStock =
    reward.stockQuantity === null || reward.stockQuantity > 0;
  const canClaim =
    reward.isActive && hasEnoughPoints && hasTier && inStock && !!onClaim;

  const categoryStyle =
    CATEGORY_STYLES[reward.category] ?? CATEGORY_STYLES.digital;

  const handleClaim = async () => {
    if (!canClaim) return;
    setIsClaiming(true);
    try {
      onClaim?.(reward.id);
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        !reward.isActive && "opacity-60",
      )}
    >
      {/* Top row: category badge + partner */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
            categoryStyle.color,
            categoryStyle.bg,
            categoryStyle.border,
          )}
        >
          {categoryStyle.label}
        </span>

        {reward.partnerName && (
          <div className="flex items-center gap-1.5">
            {reward.partnerLogoUrl ? (
              <img
                src={reward.partnerLogoUrl}
                alt={reward.partnerName}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] text-muted-foreground">
              {reward.partnerName}
            </span>
          </div>
        )}
      </div>

      {/* Name + description */}
      <div className="mt-3 flex-1">
        <h3 className="text-sm font-semibold leading-tight">{reward.name}</h3>
        {reward.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {reward.description}
          </p>
        )}
      </div>

      {/* Cost + stock */}
      <div className="mt-3 flex items-center gap-2">
        <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          {reward.pointsCost.toLocaleString()} pts
        </span>

        {reward.stockQuantity !== null && (
          <span
            className={cn(
              "text-[10px]",
              reward.stockQuantity <= 5
                ? "font-medium text-red-500"
                : "text-muted-foreground",
            )}
          >
            {reward.stockQuantity} left
          </span>
        )}
      </div>

      {/* Tier requirement notice */}
      {reward.minTier && !hasTier && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>
            Requires{" "}
            <span
              className={cn(
                "font-medium",
                TIER_CONFIG[reward.minTier as TierKey]?.color ??
                  "text-foreground",
              )}
            >
              {TIER_CONFIG[reward.minTier as TierKey]?.label ?? reward.minTier}
            </span>
          </span>
        </div>
      )}

      {/* Claim button */}
      <Button
        size="sm"
        className={cn(
          "mt-3 w-full gap-1.5",
          canClaim
            ? "active:scale-95"
            : "pointer-events-none opacity-50",
        )}
        disabled={!canClaim || isClaiming}
        onClick={handleClaim}
      >
        {isClaiming ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : !hasEnoughPoints ? (
          <>
            <Lock className="h-3.5 w-3.5" />
            Need {(reward.pointsCost - userPoints).toLocaleString()} more pts
          </>
        ) : !hasTier ? (
          <>
            <Lock className="h-3.5 w-3.5" />
            Tier locked
          </>
        ) : !inStock ? (
          "Out of stock"
        ) : (
          <>
            <Gift className="h-3.5 w-3.5" />
            Claim reward
          </>
        )}
      </Button>
    </div>
  );
}
