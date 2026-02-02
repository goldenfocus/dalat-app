"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Play, Images } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
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

      {/* Mobile: Compact horizontal scroll */}
      <div className="lg:hidden">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {moments.map((moment) => (
            <button
              key={moment.id}
              onClick={() => handleMomentClick(moment)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
            >
              {/* Rounded square thumbnail */}
              <div className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-muted shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                {moment.thumbnail_url || moment.media_url ? (
                  <img
                    src={cloudflareLoader({
                      src: moment.thumbnail_url || moment.media_url!,
                      width: 144,
                      quality: 80,
                    })}
                    alt={moment.event_title}
                    className="w-full h-full object-cover group-active:scale-95 transition-transform"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Images className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}

                {/* Play icon for videos */}
                {moment.content_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Event title */}
              <span className="text-[11px] text-muted-foreground text-center w-[72px] truncate leading-tight">
                {moment.event_title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: Card-based layout */}
      <div className="hidden lg:block container max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-6 gap-3">
          {moments.slice(0, 6).map((moment, index) => (
            <button
              key={moment.id}
              onClick={() => handleMomentClick(moment)}
              className={cn(
                "group relative aspect-[4/5] rounded-xl overflow-hidden bg-muted",
                "ring-1 ring-black/5 dark:ring-white/10",
                "hover:ring-2 hover:ring-primary/50 transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                // Fade out last items if more than 6
                index >= 5 && moments.length > 6 && "opacity-80"
              )}
            >
              {/* Image */}
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

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Play icon for videos */}
              {moment.content_type === "video" && (
                <div className="absolute top-2 right-2">
                  <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}

              {/* Event title overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-sm font-medium leading-tight line-clamp-2 drop-shadow-sm">
                  {moment.event_title}
                </p>
              </div>

              {/* "View more" indicator on last card if there are more */}
              {index === 5 && moments.length > 6 && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-medium">
                    +{moments.length - 6} more
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
