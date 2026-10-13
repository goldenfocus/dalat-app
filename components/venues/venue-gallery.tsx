"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PhotoViewer, type ViewerPhoto } from "@/components/ui/photo-viewer";

export type VenueGalleryPhoto = {
  id: string;
  src: string;
  thumb: string;
  alt: string;
  caption?: string | null;
  /** Present only for Google Places photos (required attribution). */
  googleAuthors?: { name: string; uri?: string }[];
};

/** Swipeable strip: the venue's own photos first, then attributed Google photos. */
export function VenueGallery({ photos, venueName }: { photos: VenueGalleryPhoto[]; venueName: string }) {
  const t = useTranslations("venues");
  const [index, setIndex] = useState<number | null>(null);
  if (!photos.length) return null;
  const credit = (p: VenueGalleryPhoto) =>
    p.googleAuthors ? (
      <>
        {t("googlePhotoBy")}{" "}
        {p.googleAuthors.length
          ? p.googleAuthors.map((a, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {a.uri ? (
                  <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">{a.name}</a>
                ) : (
                  a.name
                )}
              </span>
            ))
          : "Google"}{" "}
        · Google
      </>
    ) : null;
  const viewer: ViewerPhoto[] = photos.map((p) => ({
    id: p.id,
    src: p.src,
    alt: p.alt,
    caption: p.caption,
    credit: credit(p),
    downloadable: !p.googleAuthors,
  }));
  return (
    <>
      <div className="-mx-4 mb-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`relative shrink-0 snap-start overflow-hidden rounded-xl bg-muted ${
              i === 0 ? "h-56 w-[85%] sm:h-64 sm:w-[60%]" : "h-56 w-[60%] sm:h-64 sm:w-[35%]"
            }`}
            aria-label={p.alt || venueName}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.alt} loading={i < 2 ? "eager" : "lazy"} className="h-full w-full object-cover [content-visibility:visible]" />
            {p.googleAuthors && (
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Google
              </span>
            )}
          </button>
        ))}
      </div>
      <PhotoViewer photos={viewer} index={index} onIndexChange={setIndex} shareTitle={venueName} />
    </>
  );
}
