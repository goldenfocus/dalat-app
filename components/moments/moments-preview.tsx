"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Camera, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isVideoUrl } from "@/lib/media-utils";
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
                <Badge variant="secondary" className="text-xs">
                  {totalCount}
                </Badge>
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
                  {moment.content_type !== "text" && moment.media_url ? (
                    isVideoUrl(moment.media_url) ? (
                      <video
                        src={moment.media_url}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <Image
                        src={moment.media_url}
                        alt={moment.text_content || "Moment thumbnail"}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-1">
                      <span className="line-clamp-3">{moment.text_content}</span>
                    </div>
                  )}
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
