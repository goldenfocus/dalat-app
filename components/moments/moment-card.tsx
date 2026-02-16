"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { triggerHaptic } from "@/lib/haptics";
import { Play, MessageCircle, FileText, Music, File } from "lucide-react";
import { cloudflareLoader } from "@/lib/image-cdn";
import { getCfStreamThumbnailUrl, getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { getYouTubeThumbnail } from "@/components/shared/material-renderers";
import type { MomentContentType } from "@/lib/types";

// Minimal moment shape needed for display
export interface MomentForCard {
  id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url?: string | null;
  text_content: string | null;
  // Material type fields
  youtube_video_id?: string | null;
  file_url?: string | null;
  original_filename?: string | null;
  title?: string | null;
  artist?: string | null;
  audio_thumbnail_url?: string | null;
  // Video fields (for lightbox)
  cf_video_uid?: string | null;
  cf_playback_url?: string | null;
  video_status?: string | null;
}

interface MomentCardProps {
  moment: MomentForCard;
  /** Event slug for clean URL generation (e.g., /events/[slug]/moments/[id]) */
  eventSlug?: string;
  /** Navigation origin context: "moments" for feed, "event" for event-specific, "profile" for profile timeline, "discovery" for search results */
  from?: "moments" | "event" | "profile" | "discovery";
  /** Comment count to display as badge (only shown if > 0) */
  commentCount?: number;
  /** Click handler for lightbox mode. When provided, opens lightbox instead of navigating. */
  onLightboxOpen?: () => void;
}

// Extract YouTube video ID from URL
function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/shorts\/([^&\s?]+)/,
    /youtube\.com\/live\/([^&\s?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function MomentCard({ moment, eventSlug, from, commentCount, onLightboxOpen }: MomentCardProps) {
  const [thumbnailError, setThumbnailError] = useState(false);

  // Use clean URL format when event slug is available
  const basePath = eventSlug
    ? `/events/${eventSlug}/moments/${moment.id}`
    : `/moments/${moment.id}`;
  const href = from ? `${basePath}?from=${from}` : basePath;

  // Get YouTube video ID (from stored field or extracted from URL)
  const youtubeVideoId = moment.youtube_video_id || extractVideoId((moment as { youtube_url?: string }).youtube_url);

  // Get thumbnail for YouTube moments
  const youtubeThumb = moment.content_type === "youtube" && youtubeVideoId
    ? getYouTubeThumbnail(youtubeVideoId, "high")
    : null;

  // Direct YouTube URL for opening in new tab
  const youtubeDirectUrl = youtubeVideoId
    ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
    : null;

  // Derive video thumbnail: use stored thumbnail_url, or derive from CF Stream playback URL
  const derivedThumbnailUrl = moment.thumbnail_url || getCfStreamThumbnailUrl(moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid));

  // Show thumbnail only if available and not errored
  const showThumbnail = derivedThumbnailUrl && !thumbnailError;

  // Content wrapper - either a button (lightbox) or Link (navigation)
  const handleClick = () => {
    triggerHaptic("selection");
    if (onLightboxOpen) {
      onLightboxOpen();
    }
  };

  const cardContent = (
    <article className="group relative aspect-square overflow-hidden rounded-lg bg-muted active:scale-[0.98] transition-transform">
        {/* YouTube moments */}
        {moment.content_type === "youtube" && youtubeThumb && (
          <>
            <Image
              src={youtubeThumb}
              alt={moment.text_content || "YouTube video"}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, 200px"
              unoptimized
            />
            {/* YouTube play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>
          </>
        )}

        {/* Audio moments */}
        {moment.content_type === "audio" && (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-br from-purple-500/20 to-purple-600/30">
            {moment.audio_thumbnail_url ? (
              <Image
                src={moment.audio_thumbnail_url}
                alt={moment.title || "Album art"}
                fill
                className="object-cover opacity-80"
                sizes="(max-width: 640px) 50vw, 200px"
                unoptimized
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-purple-500/30 flex items-center justify-center">
                <Music className="w-8 h-8 text-purple-600" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-white text-xs font-medium truncate">
                {moment.title || moment.original_filename || "Audio"}
              </p>
              {moment.artist && (
                <p className="text-white/70 text-xs truncate">{moment.artist}</p>
              )}
            </div>
          </div>
        )}

        {/* PDF moments */}
        {moment.content_type === "pdf" && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-red-500/10 to-red-600/20">
            <div className="w-16 h-16 rounded-xl bg-red-500/20 flex items-center justify-center mb-2">
              <FileText className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-center text-xs font-medium text-muted-foreground truncate max-w-full px-2">
              {moment.title || moment.original_filename || "PDF"}
            </p>
          </div>
        )}

        {/* Document moments */}
        {moment.content_type === "document" && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/20">
            <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center mb-2">
              <File className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-center text-xs font-medium text-muted-foreground truncate max-w-full px-2">
              {moment.title || moment.original_filename || "Document"}
            </p>
          </div>
        )}

        {/* Image moments (material type, not photo) */}
        {moment.content_type === "image" && moment.file_url && (
          <Image
            src={moment.file_url}
            alt={moment.text_content || moment.title || "Image"}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 200px"
            unoptimized
          />
        )}

        {/* Video moments */}
        {moment.content_type === "video" && (moment.media_url || moment.cf_video_uid) && (
          <>
            {showThumbnail ? (
              derivedThumbnailUrl.includes('cloudflarestream.com') ? (
                // CF Stream thumbnails should not use cloudflareLoader
                <Image
                  src={derivedThumbnailUrl}
                  alt={moment.text_content || "Video thumbnail"}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 200px"
                  onError={() => setThumbnailError(true)}
                  unoptimized
                />
              ) : (
                <Image
                  loader={cloudflareLoader}
                  src={derivedThumbnailUrl}
                  alt={moment.text_content || "Video thumbnail"}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 200px"
                  onError={() => setThumbnailError(true)}
                />
              )
            ) : (
              // Fallback: gradient background for videos without thumbnails
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50" />
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>
          </>
        )}

        {/* Photo moments (original behavior) */}
        {moment.content_type === "photo" && moment.media_url && (
          <Image
            loader={cloudflareLoader}
            src={moment.media_url}
            alt={moment.text_content || "Moment photo"}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 200px"
          />
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
  );

  // YouTube moments: always open YouTube directly in new tab
  if (moment.content_type === "youtube" && youtubeDirectUrl) {
    return (
      <a
        href={youtubeDirectUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block touch-manipulation"
        onClick={() => triggerHaptic("selection")}
      >
        {cardContent}
      </a>
    );
  }

  // Lightbox mode: use button
  if (onLightboxOpen) {
    return (
      <button
        type="button"
        className="block w-full text-left touch-manipulation"
        onClick={handleClick}
      >
        {cardContent}
      </button>
    );
  }

  // Default: use Link for SEO and direct navigation
  return (
    <Link
      href={href}
      className="block touch-manipulation"
      onClick={handleClick}
    >
      {cardContent}
    </Link>
  );
}
