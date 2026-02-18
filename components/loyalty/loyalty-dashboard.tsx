"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoyaltyProgress } from "@/components/loyalty/loyalty-progress";
import { LeaderboardEntry } from "@/components/loyalty/leaderboard-entry";
import { TierBadge, TIER_CONFIG, type TierKey } from "@/components/loyalty/tier-badge";
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
  total_lifetime_points: number;
  current_cycle_points: number;
  cycle_type: string;
  next_tier: string | null;
  points_to_next_tier: number;
  progress_percentage: number;
  show_on_leaderboard: boolean;
}

interface PointEntry {
  id: string;
  action_type: string;
  points_earned: number;
  description: string | null;
  earned_at: string;
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
  const [recentActivity, setRecentActivity] = useState<PointEntry[]>([]);
  const [topUsers, setTopUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, activityRes, leaderboardRes] = await Promise.all([
          fetch("/api/loyalty/status"),
          fetch("/api/loyalty/activity?limit=5"),
          fetch("/api/loyalty/leaderboard?limit=5"),
        ]);

        if (statusRes.ok) {
          const { data } = await statusRes.json();
          setStatus(data);
        }
        if (activityRes.ok) {
          const { data } = await activityRes.json();
          setRecentActivity(data ?? []);
        }
        if (leaderboardRes.ok) {
          const { data } = await leaderboardRes.json();
          setTopUsers(data ?? []);
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
          Sign in to start earning points, unlock rewards, and climb the leaderboard.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium active:scale-95 transition-all"
        >
          Sign in to get started
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
        <h2 className="text-xl font-bold">Welcome, Explorer!</h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Start exploring Dalat to earn your first points. RSVP to events, share moments, and join the community.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium active:scale-95 transition-all"
        >
          Discover events
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
            currentPoints={status.current_cycle_points}
            currentTier={status.current_tier}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {status.total_lifetime_points.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{t("totalPoints")}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {status.current_cycle_points.toLocaleString()}
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
            Overview
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
            Host
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
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No activity yet. Start exploring!
                </p>
              ) : (
                <div className="space-y-1">
                  {recentActivity.map((entry) => {
                    const IconComp = ACTION_ICONS[entry.action_type] ?? Sparkles;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 rounded-lg px-2 py-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <IconComp className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {entry.description ?? entry.action_type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.earned_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-500 tabular-nums shrink-0">
                          +{entry.points_earned}
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
              <CardTitle className="text-sm">Ways to earn</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Calendar, label: "RSVP to events", pts: 10 },
                  { icon: Camera, label: "Share moments", pts: 5 },
                  { icon: MessageSquare, label: "Post comments", pts: 3 },
                  { icon: Heart, label: "Like moments", pts: 1 },
                  { icon: Radio, label: "Host events", pts: 30 },
                  { icon: Users, label: "Invite friends", pts: 10 },
                ].map(({ icon: Icon, label, pts }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{label}</p>
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
                  The leaderboard is heating up. Be among the first!
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
                View full leaderboard
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
              <h3 className="font-semibold">Rewards catalog</h3>
              <p className="text-sm text-muted-foreground">
                Redeem your points for exclusive perks, badges, and experiences in Dalat.
              </p>
              <Link
                href="/loyalty/rewards"
                className="inline-flex items-center gap-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-all"
              >
                Browse rewards
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
                View host perks
                <ChevronRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
