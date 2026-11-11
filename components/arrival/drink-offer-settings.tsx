"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MenuSection } from "@/lib/menu/types";
import { Button } from "@/components/ui/button";
export function DrinkOfferSettings({ slug, limit, itemIds, menu, onSaved }: { slug: string; limit: number; itemIds: string[]; menu: MenuSection[]; onSaved: () => Promise<void> }) {
  const t = useTranslations("arrival.registration");
  const visibleIds = new Set(menu.flatMap(section => section.items.map(item => item.id)));
  const [value, setValue] = useState(String(limit));
  const [selected, setSelected] = useState(itemIds);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFailed(false);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival/offer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: Number(value), itemIds: selected }) });
      if (!response.ok) throw new Error("save");
      await onSaved();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="mb-6 space-y-3 rounded-lg border p-4">
    <label className="block space-y-2"><span className="font-medium">{t("freeDrinkLimit")}</span><input type="text" inputMode="numeric" pattern="[0-9]*" required value={value} onChange={event => setValue(event.target.value.replace(/\D/g, ""))} className="min-h-12 w-full rounded-lg border bg-background px-3 text-base" /></label>
    <fieldset><legend className="font-medium">{t("complimentary")}</legend>
      {menu.flatMap(section => section.items).map(item => <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} className="h-5 w-5 accent-primary" />{item.name}
      </label>)}
      {selected.filter(id => !visibleIds.has(id)).map(id => <label key={id} className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
        <input type="checkbox" checked disabled={busy} onChange={() => setSelected(selected.filter(itemId => itemId !== id))} className="h-5 w-5 accent-primary" />{t("hiddenItem")} · {id.slice(-6)}
      </label>)}
    </fieldset>
    <Button type="submit" disabled={busy || !/^\d+$/.test(value) || Number(value)>100000} loading={busy}>{t("saveLimit")}</Button>
    {failed && <p role="alert">{t("saveFailed")}</p>}
  </form>;
}
