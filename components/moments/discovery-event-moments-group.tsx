"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Calendar, MapPin, ChevronRight, Music } from "lucide-react";
import { AlbumShareButton } from "./album-share-button";
import { MomentCard } from "./moment-card";
import { triggerHaptic } from "@/lib/haptics";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import type { DiscoveryEventMomentsGroup as DiscoveryEventMomentsGroupType, DiscoveryGroupedMoment } from "@/lib/types";
import type { LightboxMoment } from "./moment-lightbox";

interface DiscoveryEventMomentsGroupProps {
  group: DiscoveryEventMomentsGroupType;
  /** Map of moment ID to comment count */
  commentCounts?: Map<string, number>;
}

/** Convert DiscoveryGroupedMoment to LightboxMoment format */
function toLightboxMoments(moments: DiscoveryGroupedMoment[]): LightboxMoment[] {
  return moments.map(m => ({
    id: m.id,
    content_type: m.content_type,
    media_url: m.media_url,
    thumbnail_url: m.thumbnail_url,
    text_content: m.text_content,
    // Video CF fields for HLS playback in lightbox
    cf_video_uid: m.cf_video_uid,
    cf_playback_url: m.cf_playback_url,
    video_status: m.video_status as LightboxMoment['video_status'],
    // User info for watermark
    display_name: m.display_name,
    username: m.username,
  }));
}

/** Inner grid that uses the lightbox context */
function DiscoveryMomentsGridWithLightbox({
  moments,
  eventSlug,
  commentCounts,
}: {
  moments: DiscoveryGroupedMoment[];
  eventSlug: string;
  commentCounts?: Map<string, number>;
}) {
  const { openLightbox } = useMomentsLightbox();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {moments.map((moment, index) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          eventSlug={eventSlug}
          from="discovery"
          commentCount={commentCounts?.get(moment.id)}
          onLightboxOpen={() => openLightbox(index)}
        />
      ))}
    </div>
  );
}

export function DiscoveryEventMomentsGroup({ group, commentCounts }: DiscoveryEventMomentsGroupProps) {
  const t = useTranslations("moments");
  const eventDate = new Date(group.event_starts_at);
  const remainingCount = group.total_moment_count - group.moments.length;

  // Convert moments for lightbox
  const lightboxMoments = toLightboxMoments(group.moments);

  return (
    <div className="space-y-3">
      {/* Event header with share button */}
      <div className="flex items-center gap-2 px-3 py-2.5 -mx-3 rounded-lg bg-muted/50">
        {/* Tappable link to event */}
        <Link
          href={`/events/${group.event_slug}`}
          className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 active:scale-[0.99] transition-all touch-manipulation"
        >
          {/* Event thumbnail */}
          {group.event_image_url && (
            <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
              <Image
                src={group.event_image_url}
                alt={group.event_title}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{group.event_title}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(eventDate, "MMM d")}
              </span>
              {group.event_location_name && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{decodeUnicodeEscapes(group.event_location_name)}</span>
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>

        {/* Playlist button - only if event has a playlist */}
        {group.has_playlist && (
          <Link
            href={`/events/${group.event_slug}/playlist`}
            className="p-2 rounded-full hover:bg-background/50 active:scale-95 transition-all touch-manipulation"
            aria-label="Play event playlist"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
            }}
          >
            <Music className="w-5 h-5 text-primary" />
          </Link>
        )}

        {/* Share button */}
        <AlbumShareButton
          eventSlug={group.event_slug}
          eventTitle={group.event_title}
          eventDate={group.event_starts_at}
          locationName={group.event_location_name}
          momentCount={group.total_moment_count}
        />
      </div>

      {/* Moments grid with lightbox */}
      <MomentsLightboxProvider moments={lightboxMoments} eventSlug={group.event_slug}>
        <DiscoveryMomentsGridWithLightbox
          moments={group.moments}
          eventSlug={group.event_slug}
          commentCounts={commentCounts}
        />
      </MomentsLightboxProvider>

      {/* "View X more" link */}
      {remainingCount > 0 && (
        <Link
          href={`/events/${group.event_slug}/moments`}
          className="flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          onClick={() => triggerHaptic("selection")}
        >
          <span>{t("viewMoreMoments", { count: remainingCount })}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
