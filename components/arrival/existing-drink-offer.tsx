"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ArrivalEvent, ArrivalOrder } from "@/lib/arrival/types";

/** Apply the offer to an unchanged unpaid order; never rewrite an existing cart. */
export function ExistingDrinkOffer({ event, order, onClaimed, eligible = false }: { eligible?: boolean; event: ArrivalEvent; order: ArrivalOrder; onClaimed: (order: ArrivalOrder) => void }) {
  const t = useTranslations("arrival");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<{ item: string; requestId: string } | null>(null);
  const lock = useRef(false);
  const choices = order.items.filter(item => item.menu_item_id && event.sponsorship?.eligibleItemIds.includes(item.menu_item_id));
  if (!eligible || !event.sponsorship || order.paid_at || (order.sponsored_vnd || 0) > 0 || !["pending", "confirmed"].includes(order.status) || !choices.length) return null;
  const chosen = selected || choices[0].menu_item_id!;
  const claim = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailed(false);
    if (pending.current?.item !== chosen) pending.current = { item: chosen, requestId: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.slug)}/arrival/reserve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: pending.current.requestId, items: order.items.map(item => ({ item_id: item.menu_item_id, qty: item.qty })), sponsoredItemId: chosen }) });
      if (!response.ok) throw new Error("claim");
      const result: { order: ArrivalOrder } = await response.json(); onClaimed(result.order);
    } catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="space-y-4 rounded-xl border border-primary/30 p-4"><p className="font-semibold">{t("registration.complimentary")}</p><label className="block space-y-2"><span>{t("registration.chooseCoveredDrink")}</span><select className="min-h-12 w-full rounded-md border bg-background px-3" disabled={busy} value={chosen} onChange={event => setSelected(event.target.value)}>{choices.map(item => <option key={item.menu_item_id} value={item.menu_item_id!}>{item.name_snapshot}</option>)}</select></label><Button className="min-h-12 w-full" disabled={busy} onClick={() => void claim()}>{t(busy ? "submitting" : "continue")}</Button>{failed && <p role="alert" className="text-destructive">{t("errorGeneric")}</p>}</section>;
}
