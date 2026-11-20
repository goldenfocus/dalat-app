"use client";

import { useState, type ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { rentalVideoMaxBytes } from "@/lib/rentals/video";

async function uploadRentalVideo(file: File, onProgress: (progress: number) => void) {
  if (!file.size || file.size > rentalVideoMaxBytes) throw new Error("Invalid size");
  const response = await fetch("/api/rentals/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size }),
  });
  if (!response.ok) throw new Error("Upload unavailable");
  const { uid, uploadUrl } = await response.json() as { uid: string; uploadUrl: string };
  const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    new Upload(file, {
      uploadUrl,
      chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => onProgress(sent / total),
      onSuccess: () => resolve(),
      onError: reject,
    }).start();
  });
  return uid;
}

export function RentalVideoEditor({ initial }: { initial: string[] }) {
  const t = useTranslations("rentalsDetails");
  const common = useTranslations("common");
  const [videos, setVideos] = useState(initial);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setError(false);
    setProgress(0);
    for (const [index, file] of files.entries()) {
      try {
        const uid = await uploadRentalVideo(file, fileProgress => setProgress((index + fileProgress) / files.length));
        setVideos(current => [...current, uid]);
      } catch {
        setError(true);
      }
    }
    setProgress(null);
  }

  function move(index: number, step: number) {
    setVideos(current => {
      const next = [...current];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }

  const button = "grid size-10 place-items-center disabled:opacity-30";
  return <fieldset className="min-w-0 space-y-3">
    <legend className="font-semibold">{t("videos")}</legend>
    <input type="hidden" name="videoEditor" value="1" />
    <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2">
      {videos.map((uid, index) => <div key={uid} className="w-[7.75rem] shrink-0 overflow-hidden rounded-xl border">
        <input type="hidden" name="videos" value={uid} />
        <div className="relative grid h-36 place-items-center bg-muted">
          <Play aria-hidden="true" className="absolute size-7 opacity-70" />
          <img src={"/api/rentals/videos/" + uid + "?poster"} alt={t("viewVideo", { number: index + 1 })}
            loading="lazy" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />
        </div>
        <div className="flex justify-between">
          <button type="button" className={button} disabled={index === 0} aria-label={common("previous")}
            onClick={() => move(index, -1)}><ChevronLeft className="size-4" /></button>
          <button type="button" className={button} disabled={index === videos.length - 1} aria-label={common("next")}
            onClick={() => move(index, 1)}><ChevronRight className="size-4" /></button>
          <button type="button" className={button} aria-label={common("remove")}
            onClick={() => setVideos(current => current.filter(value => value !== uid))}><X className="size-4" /></button>
        </div>
      </div>)}
    </div>
    <label className="block space-y-1">
      <span>{t("uploadVideos")}</span>
      <input className="block max-w-full" type="file" accept="video/*,.mov,.mp4" multiple onChange={upload} disabled={progress !== null} />
    </label>
    {progress !== null && <>
      <input type="hidden" name="uploading" value="1" />
      <progress className="w-full" value={progress} max={1} aria-label={t("uploadVideos")} />
    </>}
    {error && <p className="text-sm text-destructive" role="alert">{t("videoUploadError")}</p>}
  </fieldset>;
}
