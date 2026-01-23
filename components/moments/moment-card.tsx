"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { Play, MessageCircle } from "lucide-react";
import { cloudflareLoader } from "@/lib/image-cdn";
import type { MomentContentType } from "@/lib/types";

// Minimal moment shape needed for display
interface MomentForCard {
  id: string;
  content_type: MomentContentType;
  media_url: string | null;
  text_content: string | null;
}

interface MomentCardProps {
  moment: MomentForCard;
  /** Navigation origin context: "moments" for feed, "event" for event-specific, "profile" for profile timeline, "discovery" for search results */
  from?: "moments" | "event" | "profile" | "discovery";
  /** Comment count to display as badge (only shown if > 0) */
  commentCount?: number;
}

export function MomentCard({ moment, from, commentCount }: MomentCardProps) {
  const isVideo = isVideoUrl(moment.media_url);
  const href = from ? `/moments/${moment.id}?from=${from}` : `/moments/${moment.id}`;

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
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </div>
              </div>
            </>
          ) : (
            <Image
              loader={cloudflareLoader}
              src={moment.media_url}
              alt={moment.text_content || "Moment photo"}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, 200px"
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

        {/* Comment count badge */}
        {commentCount != null && commentCount > 0 && (
          <div
            className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs pointer-events-none"
            aria-label={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
            role="status"
          >
            <MessageCircle className="w-3 h-3" />
            <span>{commentCount}</span>
          </div>
        )}
      </article>
    </Link>
  );
}
