"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LeaderboardEntry } from "@/components/loyalty/leaderboard-entry";
import { TierBadge } from "@/components/loyalty/tier-badge";
import { Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardUser {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_tier: string;
  points: number;
}

interface CurrentUserRank {
  rank: number;
  points: number;
}

export function LeaderboardFull({ userId }: { userId: string | null }) {
  const t = useTranslations("loyalty");
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [myRank, setMyRank] = useState<CurrentUserRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      try {
        const res = await fetch("/api/loyalty/leaderboard?limit=50");
        if (res.ok) {
          const { data } = await res.json();
          setUsers(data?.leaderboard ?? []);
          setMyRank(data?.currentUserRank ?? null);
        }
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  // Top 3 podium display
  const top3 = users.slice(0, 3);
  const rest = users.slice(3);

  return (
    <div className="space-y-6">
      {/* My rank banner */}
      {userId && myRank?.rank && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("yourRank")}</p>
              <p className="text-2xl font-bold text-primary">
                #{myRank.rank}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums">
                {myRank.points.toLocaleString()} {t("pts")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {t("leaderboardEmpty")}
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 podium - only on larger screens, cards on mobile */}
          {top3.length >= 3 && (
            <div className="hidden sm:flex items-end justify-center gap-4 py-4">
              {/* 2nd place */}
              <PodiumCard user={top3[1]} rank={2} userId={userId} />
              {/* 1st place */}
              <PodiumCard user={top3[0]} rank={1} userId={userId} isFirst />
              {/* 3rd place */}
              <PodiumCard user={top3[2]} rank={3} userId={userId} />
            </div>
          )}

          {/* Mobile: show top 3 in list form */}
          <div className="sm:hidden space-y-1">
            {top3.map((user) => (
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

          {/* Rest of the list */}
          {rest.length > 0 && (
            <Card>
              <CardContent className="p-2 sm:p-4">
                <div className="space-y-0.5">
                  {rest.map((user) => (
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
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PodiumCard({
  user,
  rank,
  userId,
  isFirst,
}: {
  user: LeaderboardUser;
  rank: number;
  userId: string | null;
  isFirst?: boolean;
}) {
  const isMe = user.user_id === userId;
  const medal = rank === 1 ? "\u{1F947}" : rank === 2 ? "\u{1F948}" : "\u{1F949}";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-shadow",
        isFirst ? "w-32 pb-6" : "w-28",
        isMe && "ring-2 ring-primary/30"
      )}
    >
      <span className="text-2xl">{medal}</span>
      <Avatar className={cn(isFirst ? "h-14 w-14" : "h-11 w-11")}>
        {user.avatar_url && (
          <AvatarImage src={user.avatar_url} alt={user.display_name || user.username} />
        )}
        <AvatarFallback className="text-sm">
          {(user.display_name || user.username || "?")[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="text-center min-w-0 w-full">
        <p className={cn("text-xs font-medium truncate", isMe && "text-primary")}>
          {user.display_name || user.username}
        </p>
        <TierBadge tier={user.current_tier} size="sm" showLabel={false} />
      </div>
      <span className="text-sm font-bold tabular-nums">
        {user.points.toLocaleString()}
      </span>
    </div>
  );
}
