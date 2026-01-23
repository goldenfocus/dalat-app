"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Calendar, MapPin, ChevronRight, Play } from "lucide-react";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { DiscoveryEventMomentsGroup as DiscoveryEventMomentsGroupType, DiscoveryGroupedMoment } from "@/lib/types";

interface DiscoveryEventMomentsGroupProps {
  group: DiscoveryEventMomentsGroupType;
}

function DiscoveryMomentCard({ moment }: { moment: DiscoveryGroupedMoment }) {
  const isVideo = isVideoUrl(moment.media_url);
  const href = `/moments/${moment.id}?from=discovery`;

  return (
    <Link
      href={href}
      className="block touch-manipulation"
      onClick={() => triggerHaptic("selection")}
    >
      <article className="group relative aspect-square overflow-hidden rounded-lg bg-muted active:scale-[0.98] transition-transform">
        {/* Media content */}
        {moment.content_type !== "text" && moment.media_url && (
          isVideo ? (
            <>
              <video
                src={moment.media_url}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
              />
              {/* Play button overlay for videos */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </div>
              </div>
            </>
          ) : (
            <Image
              src={moment.media_url}
              alt={moment.text_content || "Moment photo"}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 33vw, 200px"
            />
          )
        )}

        {/* Text-only moments */}
        {moment.content_type === "text" && moment.text_content && (
          <div className="w-full h-full flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 to-primary/5">
            <p className="text-center line-clamp-4 text-sm">
              {moment.text_content}
            </p>
          </div>
        )}

      </article>
    </Link>
  );
}

export function DiscoveryEventMomentsGroup({ group }: DiscoveryEventMomentsGroupProps) {
  const t = useTranslations("moments");
  const eventDate = new Date(group.event_starts_at);
  const remainingCount = group.total_moment_count - group.moments.length;

  return (
    <div className="space-y-3">
      {/* Event header - tappable link to event */}
      <Link
        href={`/events/${group.event_slug}`}
        className="flex items-center justify-between gap-2 px-3 py-2.5 -mx-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.99] transition-all touch-manipulation"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
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
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>

      {/* Moments grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {group.moments.map((moment) => (
          <DiscoveryMomentCard key={moment.id} moment={moment} />
        ))}
      </div>

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
