"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Play } from "lucide-react";
import { openListingMedia } from "./gallery-viewer";
import "./gallery-viewer.css";

type Captions = { src: string; locale: string; label: string };
export type RentalGalleryItem = { kind: "photo" | "video"; src: string; label: string; poster?: string; captions?: Captions };
type Labels = { close: string; previous: string; next: string; reset: string; play: string; pause: string; mute: string; unmute: string; unavailable: string };

export function RentalGallery({ items, labels, title }: { items: RentalGalleryItem[]; labels: Labels; title: string }) {
  const [selected, setSelected] = useState(0);
  const closeViewer = useRef<(() => void) | null>(null);
  useEffect(() => () => closeViewer.current?.(), []);
  if (!items.length) return null;
  const index = Math.min(selected, items.length - 1);
  const current = items[index];
  const open = (position: number, opener: HTMLButtonElement) => {
    closeViewer.current?.();
    closeViewer.current = openListingMedia(items, position, opener, labels);
  };
  return (
    <section aria-label={title} className="w-full min-w-0 space-y-3">
      <button type="button" aria-label={current.label} aria-haspopup="dialog"
        onClick={(event) => open(index, event.currentTarget)}
        data-rental-gallery className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted focus-visible:ring-2 focus-visible:ring-primary">
        <img src={current.poster || current.src} alt="" draggable={false}
          className="h-full w-full select-none object-contain" />
        <span className="absolute bottom-3 right-3 rounded-full bg-black/65 p-2 text-white" aria-hidden="true">
          <Maximize2 className="size-5" />
        </span>
      </button>
      {items.length > 1 && (
        <div className="flex w-full min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain pb-2">
          {items.map((item, position) => (
            <button key={item.src} type="button" aria-label={item.label}
              aria-pressed={item.kind === "photo" ? position === index : undefined}
              aria-haspopup={item.kind === "video" ? "dialog" : undefined}
              onClick={(event) => item.kind === "video" ? open(position, event.currentTarget) : setSelected(position)}
              className="relative h-20 w-24 shrink-0 snap-start overflow-hidden rounded-[10px] border-2 border-transparent bg-muted aria-pressed:border-primary sm:w-28">
              <img src={item.poster || item.src} alt="" draggable={false} loading="lazy"
                className="h-full w-full select-none object-cover" />
              {item.kind === "video" && <Play className="absolute bottom-1 left-1 size-6 rounded-full bg-black/70 p-1 text-white" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
