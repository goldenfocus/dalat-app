"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Play, Images, Camera, Video } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { cloudflareLoader } from "@/lib/image-cdn";
import { cn } from "@/lib/utils";
import type { MomentStripItem } from "@/lib/types";

interface MomentsStripProps {
  /** Initial moments from server */
  initialMoments?: MomentStripItem[];
  /** Title for the section */
  title?: string;
  className?: string;
}

/**
 * Recent moments strip with responsive design.
 * Mobile: Compact horizontal scroll with rounded thumbnails.
 * Desktop: Elegant card-based layout with hover effects.
 */
export function MomentsStrip({ initialMoments = [], title, className }: MomentsStripProps) {
  const t = useTranslations();
  const router = useRouter();
  const [moments] = useState(initialMoments);

  if (moments.length === 0) {
    return null;
  }

  const handleMomentClick = (moment: MomentStripItem) => {
    router.push(`/events/${moment.event_slug}/moments`);
  };

  return (
    <section className={cn("py-4 lg:py-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:container lg:max-w-6xl lg:mx-auto mb-3 lg:mb-4">
        <div className="flex items-center gap-2">
          <Images className="w-4 h-4 text-muted-foreground hidden lg:block" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title || t("moments.strip.title")}
          </h2>
        </div>
        <Link
          href="/moments"
          className="text-xs lg:text-sm text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
        >
          {t("moments.strip.seeAll")}
          <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
        </Link>
      </div>

      {/* Mobile: Compact horizontal scroll with framed cards */}
      <div className="lg:hidden">
        <div className="flex gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {moments.map((moment) => (
            <button
              key={moment.id}
              onClick={() => handleMomentClick(moment)}
              className="flex-shrink-0 group w-[120px] rounded-lg overflow-hidden bg-card border border-border/50 active:scale-[0.98] transition-transform"
            >
              {/* Clean image */}
              <div className="relative aspect-square overflow-hidden">
                {moment.thumbnail_url || moment.media_url ? (
                  <img
                    src={cloudflareLoader({
                      src: moment.thumbnail_url || moment.media_url!,
                      width: 240,
                      quality: 80,
                    })}
                    alt={moment.event_title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Images className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}

                {/* Play icon for videos */}
                {moment.content_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Info panel below */}
              <div className="p-2 space-y-0.5">
                <p className="text-[11px] font-medium leading-tight line-clamp-2 min-h-[1.75rem]">
                  {moment.event_title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {moment.event_photo_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Camera className="w-2.5 h-2.5" />
                      {moment.event_photo_count}
                    </span>
                  )}
                  {moment.event_video_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Video className="w-2.5 h-2.5" />
                      {moment.event_video_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: Framed card layout - clean image with info below */}
      <div className="hidden lg:block container max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-6 gap-3">
          {moments.slice(0, 6).map((moment, index) => (
            <button
              key={moment.id}
              onClick={() => handleMomentClick(moment)}
              className={cn(
                "group text-left rounded-xl overflow-hidden bg-card border border-border/50",
                "hover:border-foreground/20 hover:shadow-lg transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                index >= 5 && moments.length > 6 && "opacity-80"
              )}
            >
              {/* Clean image - no overlays except play button */}
              <div className="relative aspect-[4/5] overflow-hidden">
                {moment.thumbnail_url || moment.media_url ? (
                  <img
                    src={cloudflareLoader({
                      src: moment.thumbnail_url || moment.media_url!,
                      width: 400,
                      quality: 80,
                    })}
                    alt={moment.event_title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                    <Images className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}

                {/* Play icon for videos - only overlay */}
                {moment.content_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}

                {/* "View more" indicator on last card */}
                {index === 5 && moments.length > 6 && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      +{moments.length - 6} more
                    </span>
                  </div>
                )}
              </div>

              {/* Info panel below image */}
              <div className="p-2.5 space-y-1">
                <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
                  {moment.event_title}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(moment.created_at), { addSuffix: true })}</span>
                  {(moment.event_photo_count > 0 || moment.event_video_count > 0) && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <div className="flex items-center gap-1.5">
                        {moment.event_photo_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Camera className="w-3 h-3" />
                            {moment.event_photo_count}
                          </span>
                        )}
                        {moment.event_video_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Video className="w-3 h-3" />
                            {moment.event_video_count}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
