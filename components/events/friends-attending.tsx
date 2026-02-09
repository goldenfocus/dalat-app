"use client";

import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslations } from "next-intl";
import type { FriendsAttending } from "@/lib/types";

interface FriendsAttendingProps {
  data: FriendsAttending;
  variant?: "compact" | "expanded";
}

/**
 * Avatar stack showing friends (people you follow) who are attending an event.
 * Compact variant for event cards, expanded variant for event detail pages.
 */
export function FriendsAttendingDisplay({ data, variant = "compact" }: FriendsAttendingProps) {
  const t = useTranslations("events");

  if (data.total_count === 0) return null;

  const profiles = data.friend_profiles;
  const remaining = data.total_count - profiles.length;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        {/* Avatar stack */}
        <div className="flex -space-x-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="ring-2 ring-zinc-900 rounded-full">
              <UserAvatar
                src={profile.avatar_url}
                alt={profile.display_name || ""}
                size="xs"
              />
            </div>
          ))}
        </div>
        {/* Text */}
        <span className="text-xs text-white/80 line-clamp-1">
          {profiles.length === 1 && remaining === 0
            ? `${profiles[0].display_name} ${t("friendsGoing", { count: 1 }).replace(/1\s*/, "")}`
            : remaining > 0
              ? `${profiles[0].display_name} + ${remaining} ${t("andMore")}`
              : t("friendsGoing", { count: data.total_count })}
        </span>
      </div>
    );
  }

  // Expanded variant for event detail pages
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2.5">
        {profiles.map((profile) => (
          <div key={profile.id} className="ring-2 ring-background rounded-full">
            <UserAvatar
              src={profile.avatar_url}
              alt={profile.display_name || ""}
              size="sm"
            />
          </div>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {data.total_count === 1
          ? `${profiles[0].display_name} ${t("friendsGoing", { count: 1 }).replace(/1\s*/, "")}`
          : remaining > 0
            ? `${profiles[0].display_name} ${t("othersYouFollow", { count: remaining })}`
            : t("friendsGoing", { count: data.total_count })}
      </span>
    </div>
  );
}
