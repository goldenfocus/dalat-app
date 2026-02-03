"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Play, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import type { MomentWithEvent } from "@/lib/types";

interface ContentCarouselProps {
  moments: MomentWithEvent[];
  title?: string;
}

/**
 * Horizontal scrollable content carousel for the Past events tab.
 * Shows moment thumbnails that link to the full feed experience.
 */
export function ContentCarousel({ moments, title }: ContentCarouselProps) {
  const t = useTranslations("feed");
  const displayTitle = title || t("recentMoments");
  if (moments.length === 0) return null;

  return (
    <section className="mb-6">
      {/* Header with "See all" link */}
      <div className="flex items-center justify-between mb-3 px-4 lg:px-0">
        <h2 className="text-lg font-semibold text-white lg:text-foreground">{displayTitle}</h2>
        <Link
          href="/feed"
          className="flex items-center gap-1 text-sm text-white/70 lg:text-muted-foreground hover:text-white lg:hover:text-foreground transition-colors px-2 py-1 -mr-2 active:scale-95"
          onClick={() => triggerHaptic("selection")}
        >
          <span>{t("viewAll")}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Scrollable carousel */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 lg:px-0 pb-2 -mb-2">
        {moments.map((moment, index) => (
          <Link
            key={moment.id}
            href={`/moments/${moment.id}`}
            className="flex-shrink-0 group"
            onClick={() => triggerHaptic("selection")}
          >
            <div className="relative w-28 h-40 rounded-xl overflow-hidden bg-muted">
              {/* Thumbnail */}
              {moment.media_url ? (
                isVideoUrl(moment.media_url) ? (
                  <video
                    src={moment.media_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <Image
                    loader={cloudflareLoader}
                    src={moment.media_url}
                    alt=""
                    width={112}
                    height={160}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 group-active:scale-100"
                    priority={index < 4}
                  />
                )
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}

              {/* Video indicator */}
              {isVideoUrl(moment.media_url) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}

              {/* Bottom gradient with event name */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                <p className="text-white text-xs font-medium line-clamp-2 leading-tight">
                  {moment.event_title}
                </p>
              </div>
            </div>
          </Link>
        ))}

        {/* "View more" card */}
        {moments.length >= 6 && (
          <Link
            href="/feed"
            className="flex-shrink-0"
            onClick={() => triggerHaptic("selection")}
          >
            <div className="w-28 h-40 rounded-xl bg-white/10 lg:bg-muted/50 border border-white/20 lg:border-border flex flex-col items-center justify-center gap-2 hover:bg-white/20 lg:hover:bg-muted transition-colors active:scale-95">
              <div className="w-10 h-10 rounded-full bg-white/20 lg:bg-primary/10 flex items-center justify-center">
                <ChevronRight className="w-5 h-5 text-white lg:text-primary" />
              </div>
              <span className="text-sm text-white/70 lg:text-muted-foreground">{t("viewAll")}</span>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
