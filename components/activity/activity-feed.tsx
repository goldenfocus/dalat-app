"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { cloudflareLoader } from "@/lib/image-cdn";
import { Loader2, Users } from "lucide-react";
import type { ActivityItem } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const t = useTranslations("activity");

  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      {/* Actor avatar */}
      <Link href={`/${item.actor_username || item.actor_id}`} className="flex-shrink-0">
        <UserAvatar src={item.actor_avatar} alt={item.actor_name || ""} size="md" />
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <Link
            href={`/${item.actor_username || item.actor_id}`}
            className="font-semibold hover:underline"
          >
            {item.actor_name || item.actor_username}
          </Link>{" "}

          {item.activity_type === "rsvp" && (
            <>
              {t("isGoingTo")}{" "}
              <Link href={`/events/${item.event_slug}`} className="font-medium hover:underline">
                {item.event_title}
              </Link>
            </>
          )}

          {item.activity_type === "moment" && (
            <>
              {t("postedMoment")}{" "}
              <Link href={`/events/${item.event_slug}`} className="font-medium hover:underline">
                {item.event_title}
              </Link>
            </>
          )}

          {item.activity_type === "follow" && (
            <>
              {t("startedFollowing")}{" "}
              <Link
                href={`/${item.target_username || item.target_id}`}
                className="font-medium hover:underline"
              >
                {item.target_name || item.target_username}
              </Link>
            </>
          )}
        </p>
        <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
      </div>

      {/* Thumbnail */}
      {item.activity_type === "rsvp" && item.event_image && (
        <Link href={`/events/${item.event_slug}`} className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden relative">
            <Image
              loader={cloudflareLoader}
              src={item.event_image}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        </Link>
      )}

      {item.activity_type === "moment" && item.moment_media_url && (
        <Link href={`/events/${item.event_slug}`} className="flex-shrink-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden relative">
            <Image
              loader={cloudflareLoader}
              src={item.moment_media_url}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        </Link>
      )}

      {item.activity_type === "follow" && item.target_avatar && (
        <Link href={`/${item.target_username || item.target_id}`} className="flex-shrink-0">
          <UserAvatar src={item.target_avatar} alt={item.target_name || ""} size="md" />
        </Link>
      )}
    </div>
  );
}

export function ActivityFeed() {
  const t = useTranslations("activity");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchActivity = useCallback(async (offset = 0) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_friend_activity", {
      p_user_id: user.id,
      p_limit: 20,
      p_offset: offset,
    });

    if (error) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const newItems = (data as ActivityItem[]) || [];
    if (offset === 0) {
      setItems(newItems);
    } else {
      setItems((prev) => [...prev, ...newItems]);
    }
    setHasMore(newItems.length === 20);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchActivity(items.length);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">{t("noActivity")}</p>
      </div>
    );
  }

  return (
    <div>
      {items.map((item, i) => (
        <ActivityCard key={`${item.activity_type}-${item.actor_id}-${item.created_at}-${i}`} item={item} />
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {loadingMore ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            "Load more"
          )}
        </button>
      )}
    </div>
  );
}
