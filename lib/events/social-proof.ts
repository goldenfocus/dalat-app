import { isDefaultImageUrl } from "@/lib/media-utils";

export interface EventSocial {
  event_id: string;
  fallback_image_url: string | null;
  fallback_photo_credit: string | null;
  last_occurrence_went: number | null;
  last_occurrence_photos: number | null;
}

export type PastProof =
  | { kind: "both"; went: number; photos: number }
  | { kind: "photos"; went: number; photos: number }
  | { kind: "went"; went: number; photos: number };

/** Counts below this read as "dead event" — hide them, show past-proof instead. */
export const MIN_VISIBLE_GOING = 3;

export function shouldShowGoingCount(goingSpots: number | undefined): boolean {
  return (goingSpots ?? 0) >= MIN_VISIBLE_GOING;
}

/** Uploaded image wins; else the resolved past-occurrence moment; else null (default art). */
export function getCardCoverUrl(
  imageUrl: string | null | undefined,
  social: EventSocial | undefined
): string | null {
  if (imageUrl && !isDefaultImageUrl(imageUrl)) return imageUrl;
  return social?.fallback_image_url ?? null;
}

export function getPastProof(social: EventSocial | undefined): PastProof | null {
  if (!social) return null;
  const went = social.last_occurrence_went ?? 0;
  const photos = social.last_occurrence_photos ?? 0;
  const wentMeaningful = went >= MIN_VISIBLE_GOING;
  if (wentMeaningful && photos > 0) return { kind: "both", went, photos };
  if (photos > 0) return { kind: "photos", went, photos };
  if (wentMeaningful) return { kind: "went", went, photos };
  return null;
}
