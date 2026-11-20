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
  const [selected, setSelected] = useState(0);
  const closeViewer = useRef<(() => void) | null>(null);
  useEffect(() => () => closeViewer.current?.(), []);
  if (!items.length) return null;
  const positions = items.map((item, index) => ({ item, index }));
  const photos = positions.filter(({ item }) => item.kind === "photo");
  const videos = positions.filter(({ item }) => item.kind === "video");
  const current = photos.find(({ index }) => index === selected) ?? photos[0];
  const open = (position: number, opener: HTMLButtonElement) => {
    closeViewer.current?.();
    closeViewer.current = openListingMedia(items, position, opener, labels);
  };
  const strip = "flex w-full min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain pb-2";
  return (
    <div className="w-full min-w-0 space-y-3">
      {videos.length > 0 && <section aria-label={videoTitle} className={strip}>
        {videos.map(({ item, index }) => (
          <button key={item.src} type="button" aria-label={item.label} aria-haspopup="dialog"
            onClick={event => open(index, event.currentTarget)}
            className="relative h-28 w-[4.25rem] shrink-0 snap-start overflow-hidden rounded-[10px] bg-muted sm:h-32 sm:w-20">
            {item.poster && <img src={item.poster} alt="" draggable={false} loading="lazy"
              onError={event => { event.currentTarget.hidden = true; }}
              className="h-full w-full select-none object-cover" />}
            <Play className="absolute bottom-1 left-1 size-7 rounded-full bg-black/70 p-1.5 text-white" aria-hidden="true" />
          </button>
        ))}
      </section>}
      {current && <section aria-label={title} className="space-y-3">
        <button type="button" aria-label={current.item.label} aria-haspopup="dialog"
          onClick={event => open(current.index, event.currentTarget)}
          data-rental-gallery className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted focus-visible:ring-2 focus-visible:ring-primary">
          <img src={current.item.src} alt="" draggable={false} className="h-full w-full select-none object-contain" />
          <span className="absolute bottom-3 right-3 rounded-full bg-black/65 p-2 text-white" aria-hidden="true">
            <Maximize2 className="size-5" />
          </span>
        </button>
        {photos.length > 1 && <div className={strip}>
          {photos.map(({ item, index }) => (
            <button key={item.src} type="button" aria-label={item.label} aria-pressed={index === current.index}
              onClick={() => setSelected(index)}
              className="relative h-20 w-24 shrink-0 snap-start overflow-hidden rounded-[10px] border-2 border-transparent bg-muted aria-pressed:border-primary sm:w-28">
              <img src={item.src} alt="" draggable={false} loading="lazy" className="h-full w-full select-none object-cover" />
            </button>
          ))}
        </div>}
      </section>}
    </div>
  );
}
