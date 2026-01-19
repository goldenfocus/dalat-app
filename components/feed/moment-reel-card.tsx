"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";
import { isVideoUrl } from "@/lib/media-utils";
import { ImmersiveImage } from "@/components/events/immersive-image";
import { VideoPlayer } from "./video-player";
import { MomentEngagementBar } from "./moment-engagement-bar";
import { EventAttributionPill } from "./event-attribution-pill";
import { EventDetailSheet } from "./event-detail-sheet";
import type { MomentWithEvent } from "@/lib/types";

interface MomentReelCardProps {
  moment: MomentWithEvent;
  isActive: boolean;
  index: number;
}

/**
 * Full-screen moment card for the TikTok-style feed.
 * Shows media with user attribution, engagement bar, and event pill.
 */
export function MomentReelCard({
  moment,
  isActive,
  index,
}: MomentReelCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const isVideo = isVideoUrl(moment.media_url);

  return (
    <article
      className="h-[100dvh] w-full relative snap-start snap-always bg-black touch-manipulation"
      data-moment-card
      data-index={index}
    >
      {/* Media area - fills viewport */}
      <div className="absolute inset-0 overflow-hidden">
        {moment.media_url && (
          isVideo ? (
            <VideoPlayer
              src={moment.media_url}
              isActive={isActive}
              poster={moment.event_image_url || undefined}
            />
          ) : (
            <ImmersiveImage src={moment.media_url} alt="" />
          )
        )}
      </div>

      {/* User attribution (top-left) */}
      <div className="absolute top-0 inset-x-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="p-4">
          <Link
            href={`/${moment.username || moment.user_id}`}
            className="inline-flex items-center gap-2.5 active:opacity-80 transition-opacity"
          >
            {moment.avatar_url ? (
              <img
                src={moment.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full ring-2 ring-white/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/20" />
            )}
            <span className="text-white font-medium text-sm drop-shadow-lg">
              @{moment.username || "user"}
            </span>
          </Link>
        </div>
      </div>

      {/* Engagement bar (right side, vertically centered) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
        <MomentEngagementBar
          momentId={moment.id}
          eventTitle={moment.event_title}
        />
      </div>

      {/* Bottom overlay with caption and event pill */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-20 pb-6 px-4">
          {/* Caption */}
          {moment.text_content && (
            <p className="text-white text-sm mb-4 line-clamp-3 drop-shadow-lg max-w-[80%]">
              {moment.text_content}
            </p>
          )}

          {/* Event attribution pill */}
          <EventAttributionPill
            eventTitle={moment.event_title}
            onClick={() => setSheetOpen(true)}
          />
        </div>
      </div>

      {/* Event detail sheet */}
      <EventDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        eventSlug={moment.event_slug}
        eventTitle={moment.event_title}
        eventImageUrl={moment.event_image_url}
        eventStartsAt={moment.event_starts_at}
        eventLocationName={moment.event_location_name}
      />
    </article>
  );
}
