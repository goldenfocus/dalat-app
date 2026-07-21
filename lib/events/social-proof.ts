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

export interface CoverCandidateMoment {
  id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  featured_priority: number | null;
  captured_at: string | null;
  created_at: string;
}

/**
 * Pick the moment photo that best represents a past event's card:
 * the manually selected cover moment wins, then featured_priority,
 * then the earliest shot (captured_at, else created_at) — matching
 * the chronological-ASC ordering galleries use.
 */
export function pickMomentCover(
  moments: CoverCandidateMoment[],
  coverMomentId: string | null | undefined
): string | null {
  const usable = moments.filter((m) => m.media_url || m.thumbnail_url);
  if (usable.length === 0) return null;

  const best = usable.reduce((a, b) => {
    if (coverMomentId) {
      if (a.id === coverMomentId) return a;
      if (b.id === coverMomentId) return b;
    }
    const prioA = a.featured_priority ?? 0;
    const prioB = b.featured_priority ?? 0;
    if (prioA !== prioB) return prioA > prioB ? a : b;
    const shotA = a.captured_at ?? a.created_at;
    const shotB = b.captured_at ?? b.created_at;
    return shotA <= shotB ? a : b;
  });

  return best.media_url ?? best.thumbnail_url;
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
