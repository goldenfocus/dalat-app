"use client";

import { useState, type ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function RentalPhotoEditor({ initial, labels }: {
  initial: string[];
  labels: { photos: string; upload: string; remove: string; previous: string; next: string; loading: string; failed: string; viewPhoto: string };
}) {
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  function move(index: number, change: number) {
    setPhotos(current => {
      const next = [...current];
      [next[index], next[index + change]] = [next[index + change], next[index]];
      return next;
    });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(false);
    try {
      for (const file of files) {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const data = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .85));
        if (!data) throw new Error("Image encoding failed");
        const response = await fetch("/api/rentals/photos", { method: "POST", body: data });
        if (!response.ok) throw new Error("Image upload failed");
        const { src } = await response.json() as { src: string };
        setPhotos(current => [...current, src]);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">{labels.photos}</legend>
      <input type="hidden" name="photos" value={photos.join("\n")} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((src, index) => (
          <div key={src} className="overflow-hidden rounded-lg border">
            <img src={src} loading="lazy" alt={labels.viewPhoto.replace("{number}", String(index + 1))} className="aspect-[4/3] w-full object-cover" />
            <div className="flex justify-between p-1">
              <button type="button" disabled={index === 0} aria-label={labels.previous} onClick={() => move(index, -1)} className="grid size-10 place-items-center disabled:opacity-30"><ChevronLeft className="size-4" /></button>
              <button type="button" disabled={index === photos.length - 1} aria-label={labels.next} onClick={() => move(index, 1)} className="grid size-10 place-items-center disabled:opacity-30"><ChevronRight className="size-4" /></button>
              <button type="button" aria-label={labels.remove} onClick={() => setPhotos(current => current.filter(photo => photo !== src))} className="grid size-10 place-items-center"><X className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <label className="block"><span>{labels.upload}</span>
        <input type="file" multiple accept="image/*" onChange={upload} disabled={busy} className="block max-w-full" />
      </label>
      {busy && <p role="status">{labels.loading}</p>}
      {busy && <input name="uploading" type="hidden" value="1" />}
      {error && <p role="alert">{labels.failed}</p>}
    </fieldset>
  );
}
