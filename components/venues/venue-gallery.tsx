"use client";

import { Camera } from "lucide-react";
import { OriginalText } from "@/components/ui/original-text";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PhotoViewer, type ViewerPhoto } from "@/components/ui/photo-viewer";
import { safeVenueUrl } from "@/lib/venues/social-links";

export type VenueGalleryPhoto = {
  id: string;
  src: string;
  thumb: string;
  alt: string;
  caption?: string | null;
  originalCaption?: string | null;
  credit?: { name: string; url: string };
  /** Present only for Google Places photos (required attribution). */
  googleAuthors?: { name: string; uri?: string }[];
};

export function VenueGallery({ photos, venueName, hero = false, skipCover = false }: {
  photos: VenueGalleryPhoto[];
  venueName: string;
  hero?: boolean;
  skipCover?: boolean;
}) {
  const t = useTranslations("venues");
  const [index, setIndex] = useState<number | null>(null);
  if (!photos.length) return null;

  const credit = (photo: VenueGalleryPhoto) => {
    if (photo.googleAuthors) {
      return <>
        {photo.googleAuthors.length > 0 && <>{t("googlePhotoBy")}{" "}</>}
        {photo.googleAuthors.map((author, i) => {
          const url = safeVenueUrl(author.uri)?.href;
          return <span key={i}>
            {i > 0 && ", "}
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{author.name}</a> : author.name}
          </span>;
        })}
        {photo.googleAuthors.length > 0 && " · "}Google
      </>;
    }
    if (!photo.credit?.name) return null;
    const url = safeVenueUrl(photo.credit.url)?.href;
    return url
      ? <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{photo.credit.name}</a>
      : photo.credit.name;
  };
  const viewer: ViewerPhoto[] = photos.map((photo) => ({
    id: photo.id,
    src: photo.src,
    alt: photo.alt,
    caption: photo.caption,
    credit: <>{credit(photo)}{photo.originalCaption && photo.originalCaption !== photo.caption && <OriginalText text={photo.originalCaption} />}</>,
    downloadable: !photo.googleAuthors && !photo.credit,
  }));
  const cover = photos[0];
  const start = skipCover ? 1 : 0;
  return (
    <>
      {hero ? (
        <figure className="relative isolate aspect-[16/10] overflow-hidden bg-muted md:order-last md:aspect-auto">
          <button type="button" onClick={() => setIndex(0)} aria-label={t("photos")} className="absolute inset-0 block h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.src} alt={cover.alt} fetchPriority="high" className="h-full w-full object-cover object-[50%_60%]" />
          </button>
          {(cover.credit || cover.googleAuthors) && (
            <figcaption className="absolute right-3 bottom-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white">
              <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{credit(cover)}</span>
            </figcaption>
          )}
        </figure>
      ) : (
        <div className="-mx-4 mb-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {photos.slice(start).map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setIndex(i + start)}
              className={`relative shrink-0 snap-start overflow-hidden rounded-xl bg-muted ${
                i === 0 ? "h-56 w-[85%] sm:h-64 sm:w-[60%]" : "h-56 w-[60%] sm:h-64 sm:w-[35%]"
              }`}
              aria-label={photo.alt || venueName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumb} alt={photo.alt} loading="lazy" className="h-full w-full object-cover" />
              {photo.googleAuthors && (
                <span className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">Google</span>
              )}
            </button>
          ))}
        </div>
      )}
      <PhotoViewer photos={viewer} index={index} onIndexChange={setIndex} shareTitle={venueName} />
    </>
  );
}
