"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { selectVenueHighlights, type VenueHighlight } from "@/lib/venues/highlights";

export function EventHighlights({ venueId, photos, selectedIds, canManage }: {
  venueId: string; photos: VenueHighlight[]; selectedIds: string[]; canManage: boolean;
}) {
  const t = useTranslations("venueHighlights");
  const tVenue = useTranslations("venues");
  const [curated, setCurated] = useState(selectedIds);
  const [draft, setDraft] = useState(selectedIds);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<VenueHighlight | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const picks = useMemo(() => selectVenueHighlights(photos, curated), [photos, curated]);
  const ordered = useMemo(() => [...picks, ...photos.filter(photo => !picks.some(pick => pick.id === photo.id))], [photos, picks]);
  if (!photos.length) return null;

  async function save() {
    setSaving(true); setError(false);
    try {
      const response = await fetch(`/api/venues/${venueId}/highlights`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ momentIds: draft }),
      });
      if (!response.ok) throw new Error("save_failed");
      setCurated(draft); setEditing(false);
    } catch { setError(true); } finally { setSaving(false); }
  }

  function move(step: number) {
    if (!active) return;
    const index = ordered.findIndex(photo => photo.id === active.id);
    setActive(ordered[(index + step + ordered.length) % ordered.length]);
  }

  return <section id="event-highlights" className="mb-8 scroll-mt-24" aria-label={t("title")}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {canManage && <Button variant="ghost" size="sm" className="min-h-11 gap-2" onClick={() => { setDraft(curated); setError(false); setEditing(true); }}>
        <ImagePlus className="h-4 w-4" />{t("choose")}
      </Button>}
    </div>
    <div className="grid grid-cols-3 gap-2">
      {picks.map((photo, index) => <button key={photo.id} onClick={() => setActive(photo)}
        aria-label={t("open", { number: index + 1 })}
        className="group aspect-square overflow-hidden rounded-xl bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <img src={photo.thumbnail_url || photo.media_url} alt={t("photo")} loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      </button>)}
    </div>
    {photos.length > 6 && <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => setActive(ordered[0] || null)}>
      {t("all", { count: photos.length })}
    </Button>}

    <Dialog open={!!active} onOpenChange={open => { if (!open) setActive(null); }}>
      <DialogContent closeLabel={tVenue("photoLightbox.close")} className="max-h-[95dvh] max-w-4xl overflow-y-auto p-4 sm:p-6" onKeyDown={event => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}>
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        {active && <>
          <img src={active.media_url} alt={t("photo")} className="mt-4 max-h-[65dvh] w-full rounded-lg object-contain" />
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" className="min-h-11 min-w-11" aria-label={t("previous")} onClick={() => move(-1)}><ChevronLeft /></Button>
            <Link href={`/events/${active.event_slug}`} className="text-center text-sm underline underline-offset-4">{t("viewEvent")}</Link>
            <Button variant="ghost" className="min-h-11 min-w-11" aria-label={t("next")} onClick={() => move(1)}><ChevronRight /></Button>
          </div>
          <p className="text-center text-xs text-muted-foreground" data-gallery-position>{ordered.findIndex(photo => photo.id === active.id) + 1} / {ordered.length}</p>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent closeLabel={tVenue("photoLightbox.close")} className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-4">
        <DialogTitle className="pr-8">{t("choose")}</DialogTitle>
        <p className="text-sm text-muted-foreground">{t("chooseHint")}</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2 p-1">
          {ordered.map(photo => {
            const index = draft.indexOf(photo.id);
            return <button key={photo.id} aria-pressed={index >= 0} aria-label={t("select")}
              disabled={index < 0 && draft.length >= 6}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 disabled:opacity-40 ${index >= 0 ? "border-primary" : "border-transparent"}`}
              onClick={() => setDraft(index >= 0 ? draft.filter(id => id !== photo.id) : [...draft, photo.id])}>
              <img src={photo.thumbnail_url || photo.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              {index >= 0 && <span className="absolute right-1 top-1 flex h-7 min-w-7 items-center justify-center gap-1 rounded-full bg-primary px-1 text-xs text-primary-foreground"><Check className="h-3 w-3" />{index + 1}</span>}
            </button>;
          })}
        </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{t("error")}</p>}
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Button variant="ghost" className="min-h-11" disabled={saving} onClick={() => setDraft([])}>{t("automatic")}</Button>
          <Button className="min-h-11" disabled={saving} onClick={save}>{t("save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
