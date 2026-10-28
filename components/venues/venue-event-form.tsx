"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/routing";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toUTCFromDaLat } from "@/lib/timezone";
import { MIN_EVENT_DESCRIPTION_LENGTH } from "@/lib/translations-readiness";

type EditableEvent = {
  slug: string; title: string; description: string | null; starts_at: string;
  capacity: number | null; updated_at: string; series_id: string | null;
};

export function VenueEventForm({ event, date, time }: { event: EditableEvent; date: string; time: string }) {
  const t = useTranslations("eventForm");
  const tv = useTranslations("venueClaim");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.slug)}/venue-details`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"), description: form.get("description"),
          starts_at: toUTCFromDaLat(String(form.get("date")), String(form.get("time"))),
          capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
          updated_at: event.updated_at,
        }),
      });
      if (!response.ok) { setError(tv(response.status === 409 ? "eventConflict" : "failed")); return; }
      router.push(`/events/${event.slug}`); router.refresh();
    } catch { setError(tv("failed")); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="space-y-5 text-foreground">
    <p className="text-sm text-muted-foreground">{tv("eventEditorHint")}</p>
    {event.series_id && <p className="text-sm text-muted-foreground">{tv("singleOccurrence")}</p>}
    <label className="block space-y-2"><span className="font-medium">{t("titleRequired")}</span>
      <Input name="title" required maxLength={200} defaultValue={event.title} /></label>
    <label className="block space-y-2"><span className="font-medium">{t("description")}</span>
      <Textarea name="description" required minLength={MIN_EVENT_DESCRIPTION_LENGTH} maxLength={16000} rows={10} defaultValue={event.description || ""} /></label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block space-y-2"><span className="font-medium">{t("dateRequired")}</span><Input name="date" type="date" required defaultValue={date} /></label>
      <label className="block space-y-2"><span className="font-medium">{t("timeRequired")}</span><Input name="time" type="time" required defaultValue={time} /></label>
    </div>
    <label className="block space-y-2"><span className="font-medium">{t("maxAttendees")}</span>
      <Input name="capacity" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} defaultValue={event.capacity ?? ""} placeholder={t("maxAttendeesPlaceholder")} /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy} className="min-h-11 w-full">{t(busy ? "saving" : "saveChanges")}</Button>
    <Link href="/venues/manage" className="inline-flex min-h-11 items-center text-primary underline">{tv("backToManagement")}</Link>
  </form>;
}
