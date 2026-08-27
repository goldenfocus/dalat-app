import {
  getCfStreamPlaybackUrl,
  getCfStreamThumbnailUrl,
  isDefaultImageUrl,
} from "@/lib/media-utils";

const SITE_URL = "https://dalat.app";

export interface SocialPreviewMoment {
  id: string;
  content_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  cf_video_uid: string | null;
  cf_playback_url: string | null;
}

export function getMomentPreviewImage(moment: SocialPreviewMoment): string | null {
  if (moment.content_type === "video") {
    return moment.thumbnail_url
      ?? getCfStreamThumbnailUrl(
        moment.cf_playback_url ?? getCfStreamPlaybackUrl(moment.cf_video_uid)
      );
  }

  if (moment.content_type === "photo" || moment.content_type === "image") {
    return moment.media_url ?? moment.thumbnail_url;
  }

  return moment.thumbnail_url;
}

/**
 * Build the visual order for an event share card: the event artwork is the
 * hero, then the manually selected cover moment, then the gallery order.
 */
export function selectEventPreviewImages(
  eventImageUrl: string | null,
  coverMomentId: string | null,
  moments: SocialPreviewMoment[],
  limit = 4
): string[] {
  const orderedMoments = coverMomentId
    ? [
        ...moments.filter((moment) => moment.id === coverMomentId),
        ...moments.filter((moment) => moment.id !== coverMomentId),
      ]
    : moments;

  const urls = [
    eventImageUrl && !isDefaultImageUrl(eventImageUrl) ? eventImageUrl : null,
    ...orderedMoments.map(getMomentPreviewImage),
  ].filter((url): url is string => Boolean(url));

  return [...new Set(urls)].slice(0, limit);
}

/**
 * Force a compact, crawler-friendly JPEG instead of exposing a multi-megabyte
 * upload or generated PNG directly to chat and social apps.
 */
export function buildSocialCardImageUrl(sourceUrl: string): string {
  return `${SITE_URL}/cdn-cgi/image/width=1200,height=630,fit=cover,quality=82,format=jpeg/${sourceUrl}`;
}

/** Keep the inputs to ImageResponse small so a four-photo collage renders fast. */
export function buildCollageSourceUrl(
  sourceUrl: string,
  width: number,
  height: number
): string {
  if (!sourceUrl.includes("cdn.dalat.app")) return sourceUrl;

  return `${SITE_URL}/cdn-cgi/image/width=${width},height=${height},fit=cover,quality=78,format=jpeg/${sourceUrl}`;
}
