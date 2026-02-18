"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge, TIER_CONFIG, type TierKey } from "@/components/loyalty/tier-badge";
import { HostRewardBadge } from "@/components/loyalty/host-reward-badge";
import { LoyaltyProgress } from "@/components/loyalty/loyalty-progress";
import {
  BarChart3,
  Star,
  Sparkles,
  Headphones,
  Palette,
  ChevronRight,
  Lock,
  Check,
  Loader2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_ORDER: TierKey[] = ["explorer", "local", "insider", "legend"];

interface HostPerk {
  key: string;
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  unlocksAt: TierKey;
  color: string;
}

const HOST_PERKS: HostPerk[] = [
  {
    key: "analytics",
    titleKey: "analyticsAccess",
    descKey: "analyticsAccessDesc",
    icon: BarChart3,
    unlocksAt: "local",
    color: "text-blue-500",
  },
  {
    key: "premium",
    titleKey: "premiumListing",
    descKey: "premiumListingDesc",
    icon: Star,
    unlocksAt: "insider",
    color: "text-amber-500",
  },
  {
    key: "featured",
    titleKey: "featuredPlacement",
    descKey: "featuredPlacementDesc",
    icon: Sparkles,
    unlocksAt: "insider",
    color: "text-purple-500",
  },
  {
    key: "support",
    titleKey: "prioritySupport",
    descKey: "prioritySupportDesc",
    icon: Headphones,
    unlocksAt: "legend",
    color: "text-emerald-500",
  },
  {
    key: "branding",
    titleKey: "customBranding",
    descKey: "customBrandingDesc",
    icon: Palette,
    unlocksAt: "legend",
    color: "text-pink-500",
  },
];

interface LoyaltyStatus {
  current_tier: string;
  current_points: number;
  total_earned: number;
  enrolled?: boolean;
}

export function HostDashboard({ userId }: { userId: string | null }) {
  const t = useTranslations("loyalty");
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/loyalty/status");
        if (res.ok) {
          const { data } = await res.json();
          if (data && data.enrolled !== false) {
            setStatus(data);
          }
        }
      } catch (err) {
        console.error("Failed to load loyalty status:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentTier: TierKey = (
    TIER_ORDER.includes((status?.current_tier ?? "explorer") as TierKey)
      ? status?.current_tier
      : "explorer"
  ) as TierKey;
  const currentTierIdx = TIER_ORDER.indexOf(currentTier);

  function isPerkUnlocked(perk: HostPerk): boolean {
    const requiredIdx = TIER_ORDER.indexOf(perk.unlocksAt);
    return currentTierIdx >= requiredIdx;
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
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

      {/* Tier roadmap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Host tier roadmap</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-muted" />

            <div className="space-y-6">
              {TIER_ORDER.map((tier, idx) => {
                const config = TIER_CONFIG[tier];
                const isActive = idx <= currentTierIdx;
                const isCurrent = tier === currentTier;
                const perksAtTier = HOST_PERKS.filter((p) => p.unlocksAt === tier);

                return (
                  <div key={tier} className="relative flex gap-4">
                    {/* Node on the line */}
                    <div
                      className={cn(
                        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-lg transition-all",
                        isCurrent
                          ? cn(config.bg, config.border, "ring-4", config.ring)
                          : isActive
                          ? cn(config.bg, config.border)
                          : "border-muted bg-background"
                      )}
                    >
                      {isActive ? (
                        <span role="img" aria-label={config.label}>
                          {config.icon}
                        </span>
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-semibold text-sm",
                            isActive ? config.color : "text-muted-foreground"
                          )}
                        >
                          {config.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>

                      {/* Perks unlocked at this tier */}
                      {perksAtTier.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {perksAtTier.map((perk) => {
                            const Icon = perk.icon;
                            const unlocked = isPerkUnlocked(perk);
                            return (
                              <div
                                key={perk.key}
                                className={cn(
                                  "flex items-start gap-3 rounded-xl border p-3 transition-all",
                                  unlocked
                                    ? "bg-card"
                                    : "bg-muted/30 opacity-60"
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                                    unlocked ? "bg-primary/10" : "bg-muted"
                                  )}
                                >
                                  {unlocked ? (
                                    <Icon className={cn("w-4.5 h-4.5", perk.color)} />
                                  ) : (
                                    <Lock className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {t(`hostRewards.${perk.titleKey}`)}
                                    </p>
                                    {unlocked && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500">
                                        <Check className="w-3 h-3" />
                                        {t("hostRewards.active")}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {t(`hostRewards.${perk.descKey}`)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {perksAtTier.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {idx === 0
                            ? "Start your journey. Everyone begins here."
                            : "Keep growing to unlock more perks!"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA to host */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-5 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Ready to host?</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Create your first event and start earning host points. Every event brings you closer to premium perks.
          </p>
          <Link
            href="/events/new"
            className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-all"
          >
            Create an event
            <ChevronRight className="w-4 h-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
