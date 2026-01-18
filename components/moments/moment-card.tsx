"use client";

import { Link } from "@/lib/i18n/routing";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { LikeButton } from "./like-button";
import { Play } from "lucide-react";
import type { MomentWithProfile } from "@/lib/types";

interface MomentCardProps {
  moment: MomentWithProfile;
  likeStatus?: { liked: boolean; count: number };
}

export function MomentCard({ moment, likeStatus }: MomentCardProps) {
  const isVideo = isVideoUrl(moment.media_url);

  return (
    <Link
      href={`/moments/${moment.id}`}
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
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </div>
              </div>
            </>
          ) : (
            <img
              src={moment.media_url}
              alt=""
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
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

        {/* Like button (top right) */}
        {likeStatus && (
          <div className="absolute top-2 right-2 z-10">
            <LikeButton
              momentId={moment.id}
              initialLiked={likeStatus.liked}
              initialCount={likeStatus.count}
              size="sm"
            />
          </div>
        )}

        {/* Overlay with user info */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <span className="text-white text-sm font-medium drop-shadow-sm">
            {moment.display_name || moment.username || "Anonymous"}
          </span>
          {moment.text_content && moment.content_type !== "text" && (
            <p className="text-white/80 text-xs mt-1 line-clamp-1">
              {moment.text_content}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
