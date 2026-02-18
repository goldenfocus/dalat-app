"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { RewardCard } from "@/components/loyalty/reward-card";
import { LoyaltyProgress } from "@/components/loyalty/loyalty-progress";
import {
  Loader2,
  Gift,
  Filter,
  Check,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RewardCategoryValue =
  | "experiential"
  | "transactional"
  | "digital"
  | "social"
  | "exclusive";

type FilterCategory = "all" | RewardCategoryValue;

const CATEGORIES: { key: FilterCategory; icon: string }[] = [
  { key: "all", icon: "All" },
  { key: "experiential", icon: "Experience" },
  { key: "transactional", icon: "Perk" },
  { key: "digital", icon: "Digital" },
  { key: "social", icon: "Social" },
  { key: "exclusive", icon: "Exclusive" },
];

interface Reward {
  id: string;
  name: string;
  description: string | null;
  category: RewardCategoryValue;
  points_cost: number;
  tier_required: string | null;
  is_active: boolean;
  stock_remaining: number | null;
  image_url: string | null;
  can_afford: boolean;
  meets_tier: boolean;
  eligible: boolean;
}

interface LoyaltyStatus {
  current_tier: string;
  current_points: number;
  total_earned: number;
}

export function RewardsCatalog({ userId }: { userId: string | null }) {
  const t = useTranslations("loyalty");
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedReward, setClaimedReward] = useState<Reward | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [rewardsRes, statusRes] = await Promise.all([
          fetch("/api/loyalty/rewards"),
          userId ? fetch("/api/loyalty/status") : Promise.resolve(null),
        ]);

        if (rewardsRes.ok) {
          const { data } = await rewardsRes.json();
          setRewards(data ?? []);
        }
        if (statusRes?.ok) {
          const { data } = await statusRes.json();
          setStatus(data);
        }
      } catch (err) {
        console.error("Failed to load rewards:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [userId]);

  const handleClaimRequest = useCallback((rewardId: string) => {
    setPendingClaim(rewardId);
    setShowConfirm(true);
  }, []);

  const handleConfirmClaim = useCallback(async () => {
    if (!pendingClaim) return;
    setShowConfirm(false);
    setClaimingId(pendingClaim);

    try {
      const res = await fetch("/api/loyalty/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: pendingClaim }),
      });

      if (res.ok) {
        const reward = rewards.find((r) => r.id === pendingClaim);
        setClaimedReward(reward ?? null);
        // Refresh status after claim
        const statusRes = await fetch("/api/loyalty/status");
        if (statusRes.ok) {
          const { data } = await statusRes.json();
          setStatus(data);
        }
      }
    } catch (err) {
      console.error("Failed to claim reward:", err);
    } finally {
      setClaimingId(null);
      setPendingClaim(null);
    }
  }, [pendingClaim, rewards]);

  const filteredRewards =
    activeCategory === "all"
      ? rewards
      : rewards.filter((r) => r.category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Points status bar */}
      {status && (
        <Card>
          <CardContent className="p-4">
            <LoyaltyProgress
              currentPoints={status.current_points}
              currentTier={status.current_tier}
            />
          </CardContent>
        </Card>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {CATEGORIES.map(({ key, icon }) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
              activeCategory === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {key === "all" ? icon : t(`category.${key}`)}
          </button>
        ))}
      </div>

      {/* Rewards grid */}
      {filteredRewards.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Gift className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">
            No rewards in this category yet. Check back soon!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredRewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              userPoints={status?.current_points ?? 0}
              userTier={status?.current_tier ?? "explorer"}
              onClaim={userId ? handleClaimRequest : undefined}
            />
          ))}
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Claim this reward?</DialogTitle>
            <DialogDescription>
              {(() => {
                const reward = rewards.find((r) => r.id === pendingClaim);
                if (!reward) return null;
                return (
                  <>
                    <span className="font-medium text-foreground">{reward.name}</span>
                    {" for "}
                    <span className="font-bold text-amber-500">
                      {reward.points_cost.toLocaleString()} pts
                    </span>
                    . This action can&apos;t be undone.
                  </>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleConfirmClaim} className="flex-1 gap-1.5">
              <Gift className="w-4 h-4" />
              {t("claimReward")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog
        open={!!claimedReward}
        onOpenChange={() => setClaimedReward(null)}
      >
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <DialogHeader>
              <DialogTitle>Reward claimed!</DialogTitle>
            </DialogHeader>
            {claimedReward && (
              <p className="text-sm text-muted-foreground">
                You claimed <span className="font-medium text-foreground">{claimedReward.name}</span>.
                Check your profile to see your rewards.
              </p>
            )}
            <DialogClose asChild>
              <Button className="mt-2 gap-1.5">
                <Sparkles className="w-4 h-4" />
                Nice!
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
