"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatVnd } from "@/lib/menu/format";
import type { HostAction, HostData } from "./host-types";

export function SponsorLedger({ data, busy, act }: { data: HostData; busy: boolean; act: HostAction }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  if (!data.access.canManage || !data.sponsorAccounting) return null;
  const accounting = data.sponsorAccounting;
  const orders = data.orders.filter(order => (order.sponsored_vnd ?? 0) > 0 && order.sponsor_status !== "void")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">{t("sponsorLedgerTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("sponsorLedgerHint")}</p></div>
    <dl className="grid gap-3 sm:grid-cols-3">
      {([ ["sponsorReserved", accounting.reserved_vnd], ["sponsorOwed", accounting.owed_vnd], ["sponsorSettled", accounting.settled_vnd] ] as const).map(([key, value]) => <div key={key} className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{t(key)}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatVnd(value, locale)}</dd></div>)}
    </dl>
    {!orders.length && <p className="border-y py-8 text-muted-foreground">{t("sponsorLedgerEmpty")}</p>}
    {orders.map(order => <article key={order.id} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{order.guestName || t("hostGuest")}</h3><p className="font-medium tabular-nums">{formatVnd(order.sponsored_vnd ?? 0, locale)}</p></div>
      <p className="text-sm text-muted-foreground">#{order.id.slice(-6).toUpperCase()} · {t(order.sponsor_status === "settled" ? "sponsorSettled" : order.sponsor_status === "reserved" ? "sponsorReserved" : "sponsorOwed")}</p>
      <ul className="text-sm">{order.items.filter(item => item.menu_item_id === order.sponsor_item_id).map((item, index) => <li key={index}>1 × {item.name_snapshot}</li>)}</ul>
      {order.sponsor_status === "owed" && order.status !== "fulfilled" && <p className="text-sm text-muted-foreground">{t("sponsorSettleAfterServed")}</p>}
      {order.sponsor_status === "owed" && order.status === "fulfilled" && <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("sponsorSettleConfirm"))) void act({ action: "settleSponsor", orderId: order.id }); }} className="min-h-12 rounded-lg border px-4 font-medium disabled:opacity-50">{t("sponsorMarkSettled")}</button>}
    </article>)}
  </section>;
}
