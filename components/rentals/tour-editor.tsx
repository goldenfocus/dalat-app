"use client";

import { ArrowDown, ArrowUp, Play, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { buildRentalTour, tourCaptionLimit, tourFrameLimit, type RentalTourFrame } from "@/lib/rentals/tour";
import type { RentalGalleryItem } from "./gallery";
import type { rentalListingMedia } from "./listing-media";
import { RentalTourMedia } from "./tour-media";

type Props = {
  media: RentalGalleryItem[];
  labels: Awaited<ReturnType<typeof rentalListingMedia>>["labels"];
  initial: RentalTourFrame[];
  automatic: boolean;
  save: (previous: "failed" | null, form: FormData) => Promise<"failed">;
};

function FrameThumbnail({ item }: { item: RentalGalleryItem }) {
  const source = item.kind === "photo" ? item.src : item.poster;
  return <span className="relative block h-14 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
    {source && <img src={source} alt="" loading="lazy" className="size-full object-cover" />}
    {item.kind === "video" && <Play aria-hidden="true"
      className="absolute inset-0 m-auto size-7 rounded-full bg-black/70 p-1.5 text-white" />}
  </span>;
}

const iconButton = "grid size-11 place-items-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30";

export function RentalTourEditor({ media, labels, initial, automatic, save }: Props) {
  const t = useTranslations("rentalsPilot");
  const common = useTranslations("common");
  const [frames, setFrames] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [feedback, submit, pending] = useActionState<"failed" | null, FormData>(save, null);
  const picker = useRef<HTMLDetailsElement>(null);
  const pickerSummary = useRef<HTMLElement>(null);
  const selected = new Set(frames.map(frame => frame.src));
  const pickable = media.filter(item => !selected.has(item.src));
  const mediaBySrc = new Map(media.map(item => [item.src, item]));
  const draft = JSON.stringify(frames);
  const changed = draft !== JSON.stringify(initial);

  function move(index: number, step: -1 | 1) {
    setFrames(current => {
      const next = [...current];
      const position = index + step;
      if (position < 0 || position >= next.length) return current;
      [next[position], next[index]] = [next[index], next[position]];
      return next;
    });
  }

  function add(src: string) {
    setFrames(current => current.length < tourFrameLimit && !current.some(frame => frame.src === src)
      ? [...current, { src, caption: "" }] : current);
    if (picker.current) picker.current.open = false;
    pickerSummary.current?.focus();
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="frames" value={draft} />
      {automatic && !changed && <p className="text-sm text-muted-foreground">{t("automaticTour")}</p>}
      {feedback && <p role="alert" className="rounded-lg border border-destructive p-3">{t("failed")}</p>}
      {frames.length > 0 && <details className="rounded-lg border p-3" onToggle={event => setPreview(event.currentTarget.open)}>
        <summary className="flex min-h-7 cursor-pointer items-center gap-2 font-medium">
          <Play className="size-4" aria-hidden="true" />{t("previewTour")}
        </summary>
        {preview && <div className="mt-2">
          <RentalTourMedia slides={buildRentalTour(media, frames)} labels={labels} autoplay={false} />
        </div>}
      </details>}
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <ol className="space-y-2">
          {frames.map(({ src, caption }, index) => {
            const item = mediaBySrc.get(src);
            if (!item) return null;
            return <li key={src} aria-label={item.label}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <FrameThumbnail item={item} />
              <label className="min-w-0">
                <span className="sr-only">{t("frameCaption")}</span>
                <textarea maxLength={tourCaptionLimit} rows={2} value={caption} placeholder={t("frameCaption")}
                  className="min-h-14 w-full resize-y rounded-lg border bg-background px-3 py-2"
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setFrames(current => current.map(frame => frame.src === src ? { ...frame, caption: value } : frame));
                  }} />
              </label>
              <div className="col-start-2 flex justify-end sm:col-start-3">
                <button type="button" disabled={index === 0} aria-label={t("moveEarlier")} className={iconButton} onClick={() => move(index, -1)}>
                  <ArrowUp aria-hidden="true" className="size-5" />
                </button>
                <button type="button" disabled={index === frames.length - 1} aria-label={t("moveLater")} className={iconButton} onClick={() => move(index, 1)}>
                  <ArrowDown aria-hidden="true" className="size-5" />
                </button>
                <button type="button" aria-label={common("remove")} className={iconButton}
                  onClick={() => setFrames(current => current.filter(frame => frame.src !== src))}>
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            </li>;
          })}
        </ol>
        {pickable.length > 0 && frames.length < tourFrameLimit && <details ref={picker} className="rounded-lg border">
          <summary ref={pickerSummary} className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
            <Plus aria-hidden="true" className="size-5" />{t("addFrame")}
          </summary>
          <ul className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto border-t p-2 sm:grid-cols-2">
            {pickable.map(item => <li key={item.src}>
              <button type="button" onClick={() => add(item.src)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-start hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
                <FrameThumbnail item={item} />
                <span className="min-w-0 break-words">{item.label}</span>
              </button>
            </li>)}
          </ul>
        </details>}
        <div className="flex flex-wrap gap-2">
          <button name="mode" value="curated" disabled={!changed || !frames.length}
            className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{common("save")}</button>
          {!automatic && <button name="mode" value="automatic" className="min-h-11 rounded-lg border px-4">
            {t("useAutomaticTour")}
          </button>}
        </div>
      </fieldset>
    </form>
  );
}
