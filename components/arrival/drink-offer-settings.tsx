"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
export function DrinkOfferSettings({ slug, limit, onSaved }: { slug: string; limit: number; onSaved: () => Promise<void> }) {
  const t = useTranslations("arrival.registration");
  const [value, setValue] = useState(String(limit));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFailed(false);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival/offer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: Number(value) }) });
      if (!response.ok) throw new Error("save");
      await onSaved();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="mb-6 space-y-3 rounded-lg border p-4">
    <label className="block space-y-2"><span className="font-medium">{t("freeDrinkLimit")}</span><input type="text" inputMode="numeric" pattern="[0-9]*" required value={value} onChange={event => setValue(event.target.value.replace(/\D/g, ""))} className="min-h-12 w-full rounded-lg border bg-background px-3 text-base" /></label>
    <p className="text-sm text-muted-foreground">{t("limitHint")}</p>
    <Button type="submit" disabled={busy || !/^\d+$/.test(value) || Number(value)>100000} loading={busy}>{t("saveLimit")}</Button>
    {failed && <p role="alert">{t("saveFailed")}</p>}
  </form>;
}
