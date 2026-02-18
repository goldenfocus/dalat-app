"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TIER_CONFIG, type TierKey } from "./tier-badge";
import {
  Gift,
  Lock,
  Loader2,
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
  points_cost: number;
  tier_required: string | null;
  is_active: boolean;
  stock_remaining: number | null;
  image_url: string | null;
  can_afford: boolean;
  meets_tier: boolean;
  eligible: boolean;
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
  const t = useTranslations("loyalty");
  const [isClaiming, setIsClaiming] = useState(false);

  const hasEnoughPoints = userPoints >= reward.points_cost;
  const hasTier = meetsMinTier(userTier, reward.tier_required);
  const inStock =
    reward.stock_remaining === null || reward.stock_remaining > 0;
  const canClaim =
    reward.is_active && hasEnoughPoints && hasTier && inStock && !!onClaim;

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
        !reward.is_active && "opacity-60",
      )}
    >
      {/* Top row: category badge + image */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
            categoryStyle.color,
            categoryStyle.bg,
            categoryStyle.border,
          )}
        >
          {t(`category.${reward.category}`)}
        </span>

        {reward.image_url && (
          <img
            src={reward.image_url}
            alt={reward.name}
            className="h-8 w-8 rounded-lg object-cover"
          />
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
          {reward.points_cost.toLocaleString()} {t("pts")}
        </span>

        {reward.stock_remaining !== null && (
          <span
            className={cn(
              "text-[10px]",
              reward.stock_remaining <= 5
                ? "font-medium text-red-500"
                : "text-muted-foreground",
            )}
          >
            {t("stockLeft", { count: reward.stock_remaining })}
          </span>
        )}
      </div>

      {/* Tier requirement notice */}
      {reward.tier_required && !hasTier && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>
            {t("insufficientTier", { tier: t(`tier.${reward.tier_required}`) })}
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
            {t("insufficientPoints", { points: (reward.points_cost - userPoints).toLocaleString() })}
          </>
        ) : !hasTier ? (
          <>
            <Lock className="h-3.5 w-3.5" />
            {t("insufficientTier", { tier: t(`tier.${reward.tier_required}`) })}
          </>
        ) : !inStock ? (
          t("outOfStock")
        ) : (
          <>
            <Gift className="h-3.5 w-3.5" />
            {t("claimReward")}
          </>
        )}
      </Button>
    </div>
  );
}
