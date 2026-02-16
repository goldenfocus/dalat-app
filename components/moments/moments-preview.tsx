"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Camera, ChevronRight, Play, Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isVideoUrl, getCfStreamThumbnailUrl, getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { cloudflareLoader } from "@/lib/image-cdn";
import type { MomentWithProfile, MomentCounts } from "@/lib/types";

interface MomentsPreviewProps {
  eventSlug: string;
  moments: MomentWithProfile[];
  counts: MomentCounts | null;
  canPost: boolean;
}

export function MomentsPreview({ eventSlug, moments, counts, canPost }: MomentsPreviewProps) {
  const t = useTranslations("moments");

  const totalCount = counts?.published_count ?? moments.length;
  const photoCount = counts?.photo_count ?? 0;
  const videoCount = counts?.video_count ?? 0;

  // Show nothing if no moments and user can't post
  if (totalCount === 0 && !canPost) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <Link
          href={`/events/${eventSlug}/moments`}
          className="block -m-4 p-4 hover:bg-muted/50 transition-colors rounded-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-medium">{t("moments")}</h3>
              {totalCount > 0 && (
                <div className="flex items-center gap-1.5">
                  {photoCount > 0 && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1 px-1.5">
                      <Camera className="w-3 h-3" />
                      {photoCount}
                    </Badge>
                  )}
                  {videoCount > 0 && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1 px-1.5">
                      <Video className="w-3 h-3" />
                      {videoCount}
                    </Badge>
                  )}
                  {/* Fallback if counts not available yet */}
                  {photoCount === 0 && videoCount === 0 && totalCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {totalCount}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Preview thumbnails */}
          {moments.length > 0 ? (
            <div className="flex gap-1 overflow-hidden">
              {moments.slice(0, 4).map((moment) => (
                <div
                  key={moment.id}
                  className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0"
                >
                  {(() => {
                    const isVideo = moment.content_type === "video" || (moment.media_url && isVideoUrl(moment.media_url));
                    const thumbUrl = moment.thumbnail_url
                      || getCfStreamThumbnailUrl(moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid));

                    if (moment.content_type === "text" || (!moment.media_url && !moment.cf_video_uid && !moment.file_url)) {
                      return (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-1">
                          <span className="line-clamp-3">{moment.text_content}</span>
                        </div>
                      );
                    }

                    if (isVideo) {
                      const displayUrl = thumbUrl;
                      return displayUrl ? (
                        <>
                          <Image
                            loader={displayUrl.includes('cloudflarestream.com') ? undefined : cloudflareLoader}
                            src={displayUrl}
                            alt={moment.text_content || "Video thumbnail"}
                            fill
                            className="object-cover"
                            sizes="64px"
                            unoptimized={displayUrl.includes('cloudflarestream.com')}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <Image
                        loader={cloudflareLoader}
                        src={moment.media_url!}
                        alt={moment.text_content || "Moment thumbnail"}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    );
                  })()}
                </div>
              ))}
              {totalCount > 4 && (
                <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-sm text-muted-foreground">
                    +{totalCount - 4}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("beFirst")}
            </p>
          )}
        </Link>
      </CardContent>
    </Card>
  );
}
