"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, ChevronRight, Play, Plus, Video } from "lucide-react";
import { cloudflareLoader } from "@/lib/image-cdn";
import { getCfStreamThumbnailUrl, getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { cn } from "@/lib/utils";
import type { MomentWithProfile, MomentCounts } from "@/lib/types";

interface PastEventMomentsShowcaseProps {
  eventSlug: string;
  moments: MomentWithProfile[];
  counts: MomentCounts | null;
  canPost: boolean;
}

/**
 * Premium gallery display for past events.
 * Magazine-style editorial layout that makes moments the hero.
 */
export function PastEventMomentsShowcase({
  eventSlug,
  moments,
  counts,
  canPost,
}: PastEventMomentsShowcaseProps) {
  const t = useTranslations("moments");
  const router = useRouter();

  const totalCount = counts?.published_count ?? moments.length;
  const photoCount = counts?.photo_count ?? 0;
  const videoCount = counts?.video_count ?? 0;

  // Show nothing if no moments and user can't post
  if (totalCount === 0 && !canPost) {
    return null;
  }

  const displayMoments = moments.slice(0, 4);
  const remainingCount = Math.max(0, totalCount - 4);

  const handleAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/events/${eventSlug}/moments/new`);
  };

  // Render a single moment tile
  const MomentTile = ({
    moment,
    className,
    sizes,
    showOverlay,
    overlayCount,
    priority = false,
  }: {
    moment: MomentWithProfile;
    className?: string;
    sizes: string;
    showOverlay?: boolean;
    overlayCount?: number;
    priority?: boolean;
  }) => (
    <div className={cn("relative overflow-hidden bg-muted group", className)}>
      {(() => {
        // Derive displayable image: thumbnail, media_url, or CF Stream thumbnail
        const displayUrl = moment.thumbnail_url
          || moment.media_url
          || getCfStreamThumbnailUrl(moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid));

        if (moment.content_type !== "text" && displayUrl) {
          const useCfLoader = !displayUrl.includes('cloudflarestream.com');
          return (
            <>
              <Image
                loader={useCfLoader ? cloudflareLoader : undefined}
                src={displayUrl}
                alt={moment.text_content || "Moment"}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes={sizes}
                priority={priority}
                unoptimized={!useCfLoader}
              />
              {/* Subtle gradient overlay for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {/* Video play icon */}
              {moment.content_type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm border border-white/20 transition-transform duration-300 group-hover:scale-110">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}
            </>
          );
        }

        return (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground p-3 text-center bg-gradient-to-br from-muted to-muted/80">
            <span className="line-clamp-4">{moment.text_content}</span>
          </div>
        );
      })()}
      {/* "+N more" overlay */}
      {showOverlay && overlayCount && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 group-hover:bg-black/50">
          <span className="text-white text-2xl font-semibold tracking-tight">
            +{overlayCount}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header with count and view all */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Camera className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t("moments")}</h3>
            {totalCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {photoCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Camera className="w-3 h-3" />
                    {photoCount}
                  </span>
                )}
                {videoCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Video className="w-3 h-3" />
                    {videoCount}
                  </span>
                )}
                {/* Fallback if counts not available yet */}
                {photoCount === 0 && videoCount === 0 && totalCount > 0 && (
                  <span>{totalCount} {totalCount === 1 ? "moment" : "moments"}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <Link
          href={`/events/${eventSlug}/moments`}
          className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors px-3 py-1.5 -mr-3 rounded-lg hover:bg-primary/5"
        >
          {t("viewAll")}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Gallery Grid - Editorial magazine layout */}
      {displayMoments.length > 0 ? (
        <Link
          href={`/events/${eventSlug}/moments`}
          className="block rounded-xl overflow-hidden"
        >
          <div className="grid grid-cols-4 gap-1">
            {/* First moment - spans 2 columns, 2 rows (hero) */}
            {displayMoments[0] && (
              <MomentTile
                moment={displayMoments[0]}
                className="col-span-2 row-span-2 aspect-square rounded-l-xl"
                sizes="(max-width: 768px) 50vw, 300px"
                priority
              />
            )}
            {/* Second moment - top right */}
            {displayMoments[1] && (
              <MomentTile
                moment={displayMoments[1]}
                className="aspect-square"
                sizes="(max-width: 768px) 25vw, 150px"
              />
            )}
            {/* Third moment - top far right with rounded corner */}
            {displayMoments[2] && (
              <MomentTile
                moment={displayMoments[2]}
                className="aspect-square rounded-tr-xl"
                sizes="(max-width: 768px) 25vw, 150px"
              />
            )}
            {/* Fourth moment or "+N more" - bottom right spanning 2 cols */}
            {displayMoments[3] ? (
              <MomentTile
                moment={displayMoments[3]}
                className="col-span-2 aspect-[2/1] rounded-br-xl"
                sizes="(max-width: 768px) 50vw, 300px"
                showOverlay={remainingCount > 0}
                overlayCount={remainingCount}
              />
            ) : displayMoments.length === 3 ? (
              // If only 3 moments, last slot shows "+N" or add button
              remainingCount > 0 ? (
                <div className="col-span-2 aspect-[2/1] rounded-br-xl bg-muted flex items-center justify-center">
                  <span className="text-muted-foreground text-lg font-medium">
                    +{remainingCount}
                  </span>
                </div>
              ) : canPost ? (
                <button
                  onClick={handleAddClick}
                  className="col-span-2 aspect-[2/1] rounded-br-xl bg-muted/50 border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1 hover:bg-muted hover:border-primary/30 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {t("addMoment")}
                  </span>
                </button>
              ) : null
            ) : null}
          </div>
        </Link>
      ) : (
        // Empty state with prominent add button
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Camera className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">{t("noMoments")}</p>
              {canPost && (
                <p className="text-sm text-muted-foreground/70">
                  {t("beFirst")}
                </p>
              )}
            </div>
            {canPost && (
              <button
                onClick={handleAddClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                {t("addMoment")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contextual add button - appears when there are moments and user can post */}
      {displayMoments.length > 0 && canPost && (
        <button
          onClick={handleAddClick}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-muted-foreground/20 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all group"
        >
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Plus className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium">{t("addYourPhotos")}</span>
        </button>
      )}
    </div>
  );
}
