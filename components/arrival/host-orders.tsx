"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatVnd } from "@/lib/menu/format";
import type { HostAction, HostOrder, OrderStatus } from "./host-types";

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed", confirmed: "fulfilled",
};
const statusKeys: Record<OrderStatus, string> = {
  pending: "orderPending", confirmed: "orderConfirmed", fulfilled: "orderServed", cancelled: "orderCancelled",
};
const actionKeys: Partial<Record<OrderStatus, string>> = {
  pending: "hostAccept", confirmed: "hostServe",
};

export function HostOrders({ orders, busy, act }: { orders: HostOrder[]; busy: boolean; act: HostAction }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const [showDone, setShowDone] = useState(false);
  const visible = orders.filter(order => showDone || !["fulfilled", "cancelled"].includes(order.status))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t("hostOrderQueue")}</h2>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} className="h-5 w-5 accent-primary" />{t("hostShowDone")}</label>
    </div>
    <p className="text-sm text-muted-foreground">{t("hostPaymentHint")}</p>
    {!visible.length && <p className="border-y py-8 text-muted-foreground">{t("hostNoOrders")}</p>}
    {visible.map(order => <article key={order.id} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{order.guestName || t("hostGuest")}</h3>
        <span className="font-medium tabular-nums">{formatVnd(order.total_vnd, locale)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t(statusKeys[order.status])} · {new Date(order.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} · #{order.id.slice(-6).toUpperCase()}</p>
      <ul className="space-y-1">{order.items.map((item, index) => <li key={`${item.name_snapshot}-${index}`}><span className="mr-2 font-semibold tabular-nums">{item.qty}×</span>{item.name_snapshot}</li>)}</ul>
      {order.note && <p className="border-l-2 pl-3 text-sm">{order.note}</p>}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        {nextStatus[order.status] && <button type="button" disabled={busy} onClick={() => void act({ action: "setOrderStatus", orderId: order.id, status: nextStatus[order.status], expectedStatus: order.status })} className="min-h-12 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{t(actionKeys[order.status]!)}</button>}
        <button type="button" disabled={busy} aria-pressed={Boolean(order.paid_at)} onClick={() => void act({ action: "setPaid", orderId: order.id, paid: !order.paid_at })} className="min-h-12 rounded-lg border px-4 font-medium disabled:opacity-50">{t(order.paid_at ? "hostPaidUndo" : "hostMarkPaid")}</button>
        {!["fulfilled", "cancelled"].includes(order.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("hostCancelConfirm"))) void act({ action: "setOrderStatus", orderId: order.id, status: "cancelled", expectedStatus: order.status }); }} className="min-h-12 px-3 text-sm text-destructive disabled:opacity-50">{t("hostCancelOrder")}</button>}
      </div>
    </article>)}
  </section>;
}
