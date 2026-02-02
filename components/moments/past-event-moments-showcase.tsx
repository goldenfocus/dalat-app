"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Camera, ChevronRight, Play, Images } from "lucide-react";
import { cloudflareLoader } from "@/lib/image-cdn";
import type { MomentWithProfile, MomentCounts } from "@/lib/types";

interface PastEventMomentsShowcaseProps {
  eventSlug: string;
  moments: MomentWithProfile[];
  counts: MomentCounts | null;
  canPost: boolean;
}

/**
 * Prominent moments display for past events.
 * Shows a larger gallery-style grid in the main content area.
 */
export function PastEventMomentsShowcase({
  eventSlug,
  moments,
  counts,
  canPost,
}: PastEventMomentsShowcaseProps) {
  const t = useTranslations("moments");

  const totalCount = counts?.published_count ?? moments.length;

  // Show nothing if no moments and user can't post
  if (totalCount === 0 && !canPost) {
    return null;
  }

  // For past events, show more thumbnails (6 instead of 4)
  const displayMoments = moments.slice(0, 6);
  const remainingCount = totalCount - displayMoments.length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Images className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{t("moments")}</h3>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              ({totalCount})
            </span>
          )}
        </div>
        <Link
          href={`/events/${eventSlug}/moments`}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          {t("viewAll")}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Gallery Grid */}
      <Link
        href={`/events/${eventSlug}/moments`}
        className="block p-3 hover:bg-muted/20 transition-colors"
      >
        {displayMoments.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {displayMoments.map((moment, index) => (
              <div
                key={moment.id}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted"
              >
                {moment.content_type !== "text" && moment.media_url ? (
                  <>
                    <Image
                      loader={cloudflareLoader}
                      src={moment.thumbnail_url || moment.media_url}
                      alt={moment.text_content || "Moment"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 30vw, 200px"
                    />
                    {/* Video play icon */}
                    {moment.content_type === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground p-2 text-center">
                    <span className="line-clamp-3">{moment.text_content}</span>
                  </div>
                )}
                {/* Show +N on last item if there are more */}
                {index === displayMoments.length - 1 && remainingCount > 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-xl font-semibold">
                      +{remainingCount}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Camera className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noMoments")}</p>
            {canPost && (
              <p className="text-sm text-primary mt-1">{t("beFirst")}</p>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}
