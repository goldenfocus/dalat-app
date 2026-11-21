"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { observeRentalStats, trackRentalMedia } from "@/lib/rentals/stats-client";
import { OriginalText } from "@/components/ui/original-text";
import type { RentalTourSlide } from "@/lib/rentals/tour";
import type { rentalListingMedia } from "./listing-media";

type Labels = Awaited<ReturnType<typeof rentalListingMedia>>["labels"];

function TourVideo({ media, visible, autoplay, loop, labels, advance }: {
  media: RentalTourSlide["media"]; visible: boolean; autoplay: boolean; loop: boolean;
  labels: Labels; advance: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState<"processing" | "unavailable">();
  const [ready, setReady] = useState(!media.stream);

  useEffect(() => {
    const player = ref.current;
    if (!player || !media.stream || !visible) return;
    const controller = new AbortController();
    let destroyStream: (() => void) | undefined;

    async function loadStream(video: HTMLVideoElement) {
      try {
        const response = await fetch(media.src, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 202) { setFailure("processing"); return; }
        if (!response.ok) throw new Error("Video unavailable");
        const { src } = await response.json() as { src: string };
        if (controller.signal.aborted) return;
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          setFailure(undefined);
          setReady(true);
          return;
        }
        const { default: Hls } = await import("hls.js");
        if (controller.signal.aborted) return;
        if (!Hls.isSupported()) throw new Error("HLS unavailable");
        const hls = new Hls();
        destroyStream = () => hls.destroy();
        hls.on(Hls.Events.MANIFEST_PARSED, () => { setFailure(undefined); setReady(true); });
        hls.on(Hls.Events.ERROR, (_event, error) => {
          if (error.fatal) setFailure("unavailable");
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!controller.signal.aborted) setFailure("unavailable");
      }
    }

    void loadStream(player);
    return () => {
      controller.abort();
      destroyStream?.();
      player.pause();
      player.removeAttribute("src");
      player.load();
    };
  }, [media.src, media.stream, visible]);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    if (!visible || !autoplay) { player.pause(); return; }
    if (ready && !failure) {
      void player.play().catch(() => {});
    }
  }, [autoplay, failure, ready, visible]);

  return <>
    <video ref={ref} src={media.stream ? undefined : media.src} poster={media.poster}
      playsInline loop={loop} muted controls preload="none" onEnded={advance}
      onError={() => setFailure("unavailable")} aria-label={media.label} className="h-full w-full object-contain">
      {media.captions && <track kind="captions" src={media.captions.src} srcLang={media.captions.locale}
        label={media.captions.label} default />}
    </video>
    {failure && <span role="status" className="absolute inset-x-3 top-3 mx-auto w-fit rounded-full bg-black/80 px-3 py-1 text-sm text-white">{labels[failure]}</span>}
  </>;
}

export function RentalTourMedia({ slides, labels, sourceLocale, autoplay = true, statsListingId }: {
  slides: RentalTourSlide[]; labels: Labels; sourceLocale?: string; autoplay?: boolean; statsListingId?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>();
  const [reduceMotion, setReduceMotion] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const touchscreenStart = useRef<{ x: number; y: number } | null>(null);
  const count = slides.length;
  const slide = slides[index % (count || 1)];
  const hasSlide = Boolean(slide);
  const running = autoAdvance ?? (autoplay && !reduceMotion);
  const move = useCallback((offset: number) => {
    if (count > 1) setIndex(at => (at % count + offset + count) % count);
  }, [count]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = false;
    const update = () => setVisible(onScreen && !document.hidden);
    const updateMotion = () => setReduceMotion(motion.matches);
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.intersectionRatio >= 0.65;
      update();
    }, { threshold: 0.65 });
    updateMotion();
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", updateMotion);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", updateMotion);
    };
  }, [hasSlide]);

  useEffect(() => {
    if (statsListingId && visible) return observeRentalStats(statsListingId, true);
  }, [statsListingId, visible]);

  useEffect(() => {
    if (!visible || !running || slide?.media.kind !== "photo" || count < 2) return;
    const timer = setTimeout(() => move(1), 4500);
    return () => clearTimeout(timer);
  }, [count, move, running, slide, visible]);

  if (!slide) return null;
  const { media, caption, original } = slide;
  function chooseFrame(offset: number) {
    if (count < 2) return;
    if (statsListingId) trackRentalMedia(statsListingId, slides[(index % count + offset + count) % count].media.src);
    move(offset);
  }
  const control = "grid size-11 shrink-0 place-items-center rounded-full text-current disabled:opacity-40";
  return <div className="min-w-0 space-y-1">
    <div ref={viewport} className="relative flex aspect-[4/5] max-h-[67svh] w-full items-center justify-center overflow-hidden rounded-xl bg-black sm:aspect-[4/3]">
      {media.kind === "video" ? (media.stream && !visible
        ? media.poster && <img src={media.poster} alt={media.label} loading="lazy" className="h-full w-full object-contain" />
        : <TourVideo key={media.src} media={media} visible={visible} autoplay={running}
          loop={count === 1} labels={labels} advance={() => { if (running) move(1); }} />)
        : <img src={media.src} alt={media.label} loading="lazy" draggable={false}
          onTouchStart={event => {
            const touch = event.touches[0];
            touchscreenStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={event => {
            const start = touchscreenStart.current;
            touchscreenStart.current = null;
            const touch = event.changedTouches[0];
            if (!start || !touch) return;
            const distance = touch.clientX - start.x;
            if (Math.abs(distance) > 45 && Math.abs(distance) > Math.abs(touch.clientY - start.y)) chooseFrame(distance < 0 ? 1 : -1);
          }}
          onTouchCancel={() => { touchscreenStart.current = null; }}
          className="h-full w-full touch-pan-y object-contain" />}
      {caption && <p className="pointer-events-none absolute inset-x-2 bottom-12 mx-auto w-fit max-w-[calc(100%-1rem)] whitespace-pre-wrap break-words rounded-lg bg-black/75 px-3 py-2 text-center text-sm font-medium text-white">{caption}</p>}
    </div>
    {count > 1 && <div className="flex items-center justify-between">
      <button type="button" className={control} aria-label={labels.previous} onClick={() => chooseFrame(-1)}>
        <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
      </button>
      <span className="text-sm tabular-nums text-muted-foreground">{index % count + 1} / {count}</span>
      <button type="button" className={control} aria-label={running ? labels.pause : labels.play} onClick={() => setAutoAdvance(!running)}>
        {running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </button>
      <button type="button" className={control} aria-label={labels.next} onClick={() => chooseFrame(1)}>
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
      </button>
    </div>}
    {original && <OriginalText key={media.src} text={original} sourceLocale={sourceLocale} />}
  </div>;
}
