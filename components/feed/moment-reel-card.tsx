"use client";

import { useState, useCallback, useEffect } from "react";
import { Link } from "@/lib/i18n/routing";
import { UserAvatar } from "@/components/ui/user-avatar";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
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
 * Clean layout: content fills screen, user info at bottom-left,
 * engagement actions at bottom-right, filter bar floats above.
 */
export function MomentReelCard({
  moment,
  isActive,
  index,
}: MomentReelCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const isVideo = isVideoUrl(moment.media_url);

  // Reset mute when scrolling away from this card
  useEffect(() => {
    if (!isActive) {
      setIsMuted(true);
    }
  }, [isActive]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
    triggerHaptic("selection");
  }, []);

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
              isMuted={isMuted}
              onMuteToggle={handleMuteToggle}
            />
          ) : (
            <ImmersiveImage src={moment.media_url} alt="" />
          )
        )}
      </div>

      {/* Engagement bar - bottom right, above the caption area */}
      <div className="absolute right-4 bottom-36 z-30">
        <MomentEngagementBar
          momentId={moment.id}
          eventTitle={moment.event_title}
          eventSlug={moment.event_slug}
          momentOwnerId={moment.user_id}
          isVideo={isVideo}
          isMuted={isMuted}
          onMuteToggle={handleMuteToggle}
        />
      </div>

      {/* Bottom overlay with user, caption, and event pill */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-24 pb-6 px-4">
          {/* User attribution - now at bottom */}
          <Link
            href={`/${moment.username || moment.user_id}`}
            className="inline-flex items-center gap-2.5 mb-3 active:opacity-80 transition-opacity"
          >
            <UserAvatar
              src={moment.avatar_url}
              size="sm"
              className="ring-2 ring-white/20"
              fallbackClassName="bg-white/20"
            />
            <span className="text-white font-medium text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              @{moment.username || "user"}
            </span>
          </Link>

          {/* Caption */}
          {moment.text_content && (
            <p className="text-white text-sm mb-4 line-clamp-3 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] max-w-[75%]">
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