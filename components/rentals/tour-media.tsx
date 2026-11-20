"use client";

import { useEffect, useRef, useState } from "react";
import type { RentalGalleryItem } from "./gallery";
import type { rentalListingMedia } from "./listing-media";
import { openListingMedia } from "./gallery-viewer";
import "./gallery-viewer.css";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

export function RentalTourMedia({ clip, photos, labels }: {
  clip?: RentalGalleryItem; photos: RentalGalleryItem[]; labels: Awaited<ReturnType<typeof rentalListingMedia>>["labels"];
}) {
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const closeViewer = useRef<(() => void) | null>(null);
  useEffect(() => () => closeViewer.current?.(), []);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let offeredAutoplay = false;
    const update = () => {
      if (!inView || document.hidden) {
        player.pause();
      } else if (!offeredAutoplay && !motion.matches) {
        offeredAutoplay = true;
        player.muted = true;
        void player.play().catch(() => {});
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    }, { threshold: 0.65 });
    observer.observe(player);
    document.addEventListener("visibilitychange", update);
    return () => {
      player.pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [clip, failed]);

  const control = "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white";
  const photo = photos[index] || photos[0];
  return <div className="relative flex aspect-[4/5] max-h-[67vh] w-full items-center justify-center overflow-hidden rounded-xl bg-black sm:aspect-[4/3]">
    {clip?.stream ? <button type="button" aria-label={clip.label} aria-haspopup="dialog"
      onClick={event => {
        closeViewer.current?.();
        closeViewer.current = openListingMedia([clip, ...photos], 0, event.currentTarget, labels);
      }}
      className="relative h-full w-full">
      {clip.poster && <img src={clip.poster} alt="" loading="lazy"
        onError={event => { event.currentTarget.hidden = true; }} className="h-full w-full object-contain" />}
      <Play className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 p-3 text-white" aria-hidden="true" />
    </button> : clip && !failed ? <video ref={ref} src={clip.src} poster={clip.poster}
      playsInline loop muted controls preload="none" onError={() => setFailed(true)}
      aria-label={clip.label} className="h-full w-full object-contain">
      {clip.captions && <track kind="captions" src={clip.captions.src} srcLang={clip.captions.locale} label={clip.captions.label} default />}
    </video> : <>
      {photo && <img src={photo.src} alt={photo.label} loading="lazy" className="h-full w-full object-contain" />}
      {failed && <span role="status" className="absolute top-3 rounded-full bg-black/80 px-3 py-1 text-sm text-white">{labels.unavailable}</span>}
      {photos.length > 1 && <>
        <button type="button" className={control + " start-2"} aria-label={labels.previous}
          onClick={() => setIndex((index + photos.length - 1) % photos.length)}><ChevronLeft className="size-5 rtl:rotate-180" /></button>
        <button type="button" className={control + " end-2"} aria-label={labels.next}
          onClick={() => setIndex((index + 1) % photos.length)}><ChevronRight className="size-5 rtl:rotate-180" /></button>
      </>}
    </>}
  </div>;
}
