"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoyaltyProgress } from "@/components/loyalty/loyalty-progress";
import { LeaderboardEntry } from "@/components/loyalty/leaderboard-entry";
import {
  Trophy,
  Gift,
  Star,
  Sparkles,
  ChevronRight,
  Loader2,
  Calendar,
  Camera,
  MessageSquare,
  Heart,
  Users,
  Radio,
  Zap,
} from "lucide-react";

// Maps action types to icons
const ACTION_ICONS: Record<string, typeof Trophy> = {
  event_rsvp: Calendar,
  event_attendance: Calendar,
  event_checkin: Zap,
  moment_upload: Camera,
  moment_like: Heart,
  comment_post: MessageSquare,
  profile_complete: Star,
  referral: Users,
  event_hosted: Radio,
  venue_created: Star,
  blog_published: Star,
  livestream_hosted: Radio,
};

interface LoyaltyStatus {
  current_tier: string;
  current_points: number;
  total_earned: number;
  total_spent: number;
  enrolled_at: string;
  last_activity: string | null;
  next_tier: string | null;
  points_to_next_tier: number | null;
  host_rewards: Array<{ reward_type: string; granted_at_tier: string; granted_at: string; metadata: unknown }>;
  recent_transactions: Array<{ points: number; activity: string; created_at: string }>;
  enrolled?: boolean;
}

interface LeaderboardUser {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_tier: string;
  points: number;
}

export function LoyaltyDashboard({ userId }: { userId: string | null }) {
  const t = useTranslations("loyalty");
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const [topUsers, setTopUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, leaderboardRes] = await Promise.all([
          fetch("/api/loyalty/status"),
          fetch("/api/loyalty/leaderboard?limit=5"),
        ]);

        if (statusRes.ok) {
          const { data } = await statusRes.json();
          if (data && data.enrolled !== false) {
            setStatus(data);
          }
        }
        if (leaderboardRes.ok) {
          const { data } = await leaderboardRes.json();
          setTopUsers(data?.leaderboard ?? []);
        }
      } catch (err) {
        console.error("Failed to load loyalty data:", err);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in state
  if (!userId) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Trophy className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          {t("signInPrompt")}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium active:scale-95 transition-all"
        >
          {t("signInCta")}
        </Link>
      </div>
    );
  }

  // No loyalty record yet (new user)
  if (!status) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold">{t("welcomeTitle")}</h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          {t("welcomePrompt")}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium active:scale-95 transition-all"
        >
          {t("discoverEvents")}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tier status card */}
      <Card>
        <CardContent className="p-5">
          <LoyaltyProgress
            currentPoints={status.current_points}
            currentTier={status.current_tier}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {status.total_earned.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{t("totalPoints")}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {status.current_points.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{t("points")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full grid grid-cols-4 h-11">
          <TabsTrigger value="overview" className="text-xs px-2 py-2">
            {t("overview")}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs px-2 py-2">
            <Trophy className="w-3.5 h-3.5 mr-1" />
            {t("leaderboard")}
          </TabsTrigger>
          <TabsTrigger value="rewards" className="text-xs px-2 py-2">
            <Gift className="w-3.5 h-3.5 mr-1" />
            {t("rewards")}
          </TabsTrigger>
          <TabsTrigger value="host" className="text-xs px-2 py-2">
            <Star className="w-3.5 h-3.5 mr-1" />
            {t("host")}
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Recent activity */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t("recentActivity")}</CardTitle>
                <Link
                  href="/loyalty/rewards"
                  className="text-xs text-primary hover:underline active:scale-95 transition-all px-2 py-1"
                >
                  {t("viewAll")}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {(status.recent_transactions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t("noActivity")}
                </p>
              ) : (
                <div className="space-y-1">
                  {(status.recent_transactions ?? []).map((entry, idx) => {
                    const IconComp = ACTION_ICONS[entry.activity] ?? Sparkles;
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-lg px-2 py-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <IconComp className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {t(`activity.${entry.activity}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-500 tabular-nums shrink-0">
                          +{entry.points}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick stats: how to earn */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("waysToEarn")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Calendar, labelKey: "earn.rsvp" as const, pts: 10 },
                  { icon: Camera, labelKey: "earn.moments" as const, pts: 5 },
                  { icon: MessageSquare, labelKey: "earn.comments" as const, pts: 3 },
                  { icon: Heart, labelKey: "earn.likes" as const, pts: 1 },
                  { icon: Radio, labelKey: "earn.host" as const, pts: 30 },
                  { icon: Users, labelKey: "earn.invite" as const, pts: 10 },
                ].map(({ icon: Icon, labelKey, pts }) => (
                  <div
                    key={labelKey}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{t(labelKey)}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-500 tabular-nums shrink-0">
                      +{pts}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard preview */}
        <TabsContent value="leaderboard" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              {topUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t("leaderboardEmpty")}
                </p>
              ) : (
                <div className="space-y-1">
                  {topUsers.map((user) => (
                    <LeaderboardEntry
                      key={user.user_id}
                      rank={user.rank}
                      username={user.username}
                      displayName={user.display_name}
                      avatarUrl={user.avatar_url ?? undefined}
                      tier={user.current_tier}
                      points={user.points}
                      isCurrentUser={user.user_id === userId}
                    />
                  ))}
                </div>
              )}
              <Link
                href="/loyalty/leaderboard"
                className="flex items-center justify-center gap-1 mt-4 px-4 py-2.5 rounded-xl bg-muted/50 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all"
              >
                {t("viewFullLeaderboard")}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rewards preview */}
        <TabsContent value="rewards" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                <Gift className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="font-semibold">{t("rewardsCatalog")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("rewardsPrompt")}
              </p>
              <Link
                href="/loyalty/rewards"
                className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-all"
              >
                {t("browseRewards")}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Host perks preview */}
        <TabsContent value="host" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
                <Star className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="font-semibold">{t("hostRewards.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("hostRewards.subtitle")}
              </p>
              <Link
                href="/loyalty/host"
                className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-all"
              >
                {t("viewHostPerks")}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
