"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
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
 * Instagram Stories-style horizontal strip of recent moments.
 * Shows circular thumbnails with event titles below.
 */
export function MomentsStrip({ initialMoments = [], title, className }: MomentsStripProps) {
  const t = useTranslations();
  const router = useRouter();
  const [moments, setMoments] = useState(initialMoments);

  // Don't render if no moments
  if (moments.length === 0) {
    return null;
  }

  const handleMomentClick = (moment: MomentStripItem) => {
    // Navigate to the moment's event moments page
    router.push(`/events/${moment.event_slug}/moments`);
  };

  return (
    <section className={cn("py-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title || t("moments.strip.title")}
        </h2>
        <Link
          href="/moments"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          {t("moments.strip.seeAll")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Horizontal scroll strip */}
      <div className="flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {moments.map((moment) => (
          <button
            key={moment.id}
            onClick={() => handleMomentClick(moment)}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
          >
            {/* Circular thumbnail with gradient ring */}
            <div className="relative">
              {/* Gradient ring */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-orange-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-background" />
              </div>

              {/* Thumbnail */}
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-background">
                {moment.thumbnail_url || moment.media_url ? (
                  <img
                    src={cloudflareLoader({
                      src: moment.thumbnail_url || moment.media_url!,
                      width: 128,
                      quality: 80,
                    })}
                    alt={moment.event_title}
                    className="w-full h-full object-cover group-active:scale-95 transition-transform"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <span className="text-2xl">📸</span>
                  </div>
                )}
              </div>

              {/* Play icon for videos */}
              {moment.content_type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-0.5" />
                  </div>
                </div>
              )}
            </div>

            {/* Event title */}
            <span className="text-xs text-muted-foreground text-center w-16 truncate">
              {moment.event_title.length > 12
                ? moment.event_title.slice(0, 12) + "…"
                : moment.event_title}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

