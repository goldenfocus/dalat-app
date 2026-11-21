"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Play } from "lucide-react";
import { openListingMedia } from "./gallery-viewer";
import "./gallery-viewer.css";

type Captions = { src: string; locale: string; label: string };
export type RentalGalleryItem = { kind: "photo" | "video"; src: string; label: string; poster?: string; captions?: Captions; stream?: boolean };
type Labels = { close: string; previous: string; next: string; reset: string; play: string; pause: string; mute: string; unmute: string; unavailable: string; processing: string };

export function RentalGallery({ items, labels, title, videoTitle }: {
  items: RentalGalleryItem[];
  labels: Labels;
  title: string;
  videoTitle: string;
}) {
  const [selected, setSelected] = useState<string>();
  const closeViewer = useRef<(() => void) | null>(null);
  useEffect(() => () => closeViewer.current?.(), []);
  const [cover, ...remainingPhotos] = items.filter(item => item.kind === "photo");
  const videos = items.filter(item => item.kind === "video");
  const gallery = cover ? [cover, ...videos, ...remainingPhotos] : videos;
  if (!gallery.length) return null;

  const currentIndex = Math.max(0, gallery.findIndex(item => item.kind === "photo" && item.src === selected));
  const current = gallery[currentIndex];
  const open = (position: number, opener: HTMLButtonElement) => {
    closeViewer.current?.();
    closeViewer.current = openListingMedia(gallery, position, opener, labels);
  };
  const poster = current.kind === "photo" ? current.src : current.poster;
  const HeroIcon = current.kind === "photo" ? Maximize2 : Play;

  return (
    <section aria-label={cover ? title : videoTitle} className="w-full min-w-0 space-y-3">
      <button type="button" aria-label={current.label} aria-haspopup="dialog"
        onClick={event => open(currentIndex, event.currentTarget)}
        data-rental-gallery className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted focus-visible:ring-2 focus-visible:ring-primary">
        {poster && <img key={poster} src={poster} alt="" draggable={false} className="h-full w-full select-none object-contain"
          onError={event => { event.currentTarget.hidden = true; }} />}
        <span className={current.kind === "photo" ? "absolute bottom-3 right-3 rounded-full bg-black/65 p-2 text-white"
          : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 p-3 text-white"} aria-hidden="true">
          <HeroIcon className="size-5" />
        </span>
      </button>
      {gallery.length > 1 && <div className="flex w-full min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain pb-2">
        {gallery.map((item, index) => {
          const video = item.kind === "video";
          const thumbnail = video ? item.poster : item.src;
          return <button key={item.src + ":" + index} type="button" aria-label={item.label}
            aria-haspopup={video ? "dialog" : undefined} aria-pressed={video ? undefined : index === currentIndex}
            onClick={event => video ? open(index, event.currentTarget) : setSelected(item.src)}
            className="relative h-20 w-24 shrink-0 snap-start overflow-hidden rounded-[10px] border-2 border-transparent bg-muted aria-pressed:border-primary sm:w-28">
            {thumbnail && <img src={thumbnail} alt="" draggable={false} loading="lazy"
              onError={event => { event.currentTarget.hidden = true; }}
              className="h-full w-full select-none object-cover" />}
            {video && <Play className="absolute bottom-1 left-1 size-7 rounded-full bg-black/70 p-1.5 text-white" aria-hidden="true" />}
          </button>;
        })}
      </div>}
    </section>
  );
}
