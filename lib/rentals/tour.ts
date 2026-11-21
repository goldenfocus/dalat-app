import { z } from "zod";
import type { RentalGalleryItem } from "@/components/rentals/gallery";

export const tourCaptionLimit = 180;
export const tourFrameLimit = 12;

export const rentalTourFrames = z.array(z.object({
  src: z.string().min(1).max(180),
  caption: z.string().trim().max(tourCaptionLimit),
}).strict()).min(1).max(tourFrameLimit)
  .refine(frames => new Set(frames.map(frame => frame.src)).size === frames.length);

export type RentalTourFrame = z.infer<typeof rentalTourFrames>[number];
export type RentalTourSlide = {
  media: RentalGalleryItem;
  caption: string;
  original?: string;
};

export function automaticRentalTour(media: RentalGalleryItem[]): RentalTourFrame[] {
  const videos = media.filter(item => item.kind === "video");
  const photos = media.filter(item => item.kind === "photo");
  const photosAfterOpeningClip = videos.length ? [videos[0], ...photos, ...videos.slice(1)] : photos;
  return [...new Set(photosAfterOpeningClip.map(item => item.src))].slice(0, tourFrameLimit)
    .map(src => ({ src, caption: "" }));
}

export function buildRentalTour(media: RentalGalleryItem[], saved: unknown, translations?: string): RentalTourSlide[] {
  const bySrc = new Map(media.map(item => [item.src, item]));
  const parsed = rentalTourFrames.safeParse(saved);
  const original = parsed.success ? parsed.data : automaticRentalTour(media);
  let localized: string[] | undefined;
  if (translations) {
    try {
      const result: unknown = JSON.parse(translations);
      if (Array.isArray(result) &&
          result.length === original.filter(frame => frame.caption).length &&
          result.every(text => typeof text === "string" && text.trim())) localized = result;
    } catch {
      // The original captions are usable if a translation is unavailable.
    }
  }
  let captionIndex = 0;
  const slides = original.flatMap(frame => {
    // Read the translation by its source position before dropping removed media.
    const caption = frame.caption ? localized?.[captionIndex++] || frame.caption : "";
    const item = bySrc.get(frame.src);
    return item ? [{ media: item, caption, original: caption === frame.caption ? undefined : frame.caption }] : [];
  });
  if (slides.length || !parsed.success) return slides;
  return buildRentalTour(media, null);
}
