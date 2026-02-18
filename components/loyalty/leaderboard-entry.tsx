import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TierBadge } from "./tier-badge";

const MEDAL_STYLES: Record<number, { text: string; bg: string }> = {
  1: { text: "text-amber-500", bg: "bg-amber-500/10" },
  2: { text: "text-slate-400", bg: "bg-slate-400/10" },
  3: { text: "text-orange-600", bg: "bg-orange-600/10" },
};

function getInitials(displayName: string, username: string): string {
  if (displayName) {
    return displayName
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return (username[0] ?? "?").toUpperCase();
}

interface LeaderboardEntryProps {
  rank: number;
  username: string;
  displayName: string;
  avatarUrl?: string;
  tier: string;
  points: number;
  isCurrentUser?: boolean;
}

export function LeaderboardEntry({
  rank,
  username,
  displayName,
  avatarUrl,
  tier,
  points,
  isCurrentUser,
}: LeaderboardEntryProps) {
  const medal = MEDAL_STYLES[rank];
  const isTopThree = rank <= 3;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
        isCurrentUser && "bg-primary/5 ring-1 ring-primary/10",
        !isCurrentUser && "hover:bg-muted/50",
      )}
    >
      {/* Rank */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          medal ? cn(medal.text, medal.bg) : "text-muted-foreground",
        )}
      >
        {isTopThree ? (
          <span className="text-base">
            {rank === 1 ? "\u{1F947}" : rank === 2 ? "\u{1F948}" : "\u{1F949}"}
          </span>
        ) : (
          <span>#{rank}</span>
        )}
      </div>

      {/* Avatar */}
      <Avatar className="h-9 w-9 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName || username} />}
        <AvatarFallback className="text-xs">
          {getInitials(displayName, username)}
        </AvatarFallback>
      </Avatar>

      {/* Name + tier */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isCurrentUser && "text-primary",
            )}
          >
            {displayName || username}
          </span>
          {isCurrentUser && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              you
            </span>
          )}
        </div>
        <TierBadge tier={tier} size="sm" showLabel />
      </div>

      {/* Points */}
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {points.toLocaleString()} pts
      </span>
    </div>
  );
}
