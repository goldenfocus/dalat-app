"use client";

import { Check, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/menu/format";
import type { ArrivalOrder, ArrivalReceipt } from "@/lib/arrival/types";

export function ArrivalReceiptView({ receipt, stale, onRefresh }: {
  receipt: ArrivalReceipt;
  stale: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("arrival");
  const order = receipt.order;

  return (
    <section className="space-y-7 py-4" aria-labelledby="arrival-receipt-title">
      <Check className="h-9 w-9 text-primary" aria-hidden="true" />
      <div>
        <p className="mb-2 text-sm font-medium text-primary">{t("checkedIn")}</p>
        <h1 id="arrival-receipt-title" className="break-words text-3xl font-semibold tracking-tight text-foreground">{t("welcomeName", { name: receipt.participant.nickname })}</h1>
        <p className="mt-3 text-muted-foreground">{t("receiptHint")}</p>
        <p className="mt-2 font-mono text-lg tracking-wider text-foreground">{receipt.participant.id.slice(0, 8).toUpperCase()}</p>
      </div>
      {order ? <ArrivalOrderView order={order} /> : <p className="border-y border-border py-5 text-muted-foreground">{t("noOrder")}</p>}
      {stale && <p className="text-sm text-muted-foreground" role="status">{t("refreshFailed")}</p>}
      <Button type="button" variant="ghost" className="min-h-11" onClick={onRefresh}><RefreshCw aria-hidden="true" />{t("refresh")}</Button>
    </section>
  );
}

export function ArrivalOrderView({ order }: { order: ArrivalOrder }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const statusKey = { pending: "orderPending", confirmed: "orderConfirmed", fulfilled: "orderServed", cancelled: "orderCancelled" }[order.status];
  return <div className="border-y border-border py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-foreground">{t("orderTitle")}</h2>
            <p className="text-sm font-medium text-primary" role="status">{t(statusKey)}</p>
          </div>
          <ul className="mt-4 space-y-3">
            {order.items.map((item, index) => (
              <li key={`${item.menu_item_id ?? "item"}-${index}`} className="flex justify-between gap-4 text-foreground">
                <span>{item.qty} × {item.name_snapshot}</span>
                <span className="shrink-0 tabular-nums">{formatVnd(item.qty * item.unit_price_vnd, locale)}</span>
              </li>
            ))}
          </ul>
          {order.note && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{order.note}</p>}
          <p className="mt-5 flex justify-between gap-3 font-semibold text-foreground"><span>{t("total")}</span><span>{formatVnd(order.total_vnd, locale)}</span></p>
          {!order.paid_at && order.status !== "cancelled" && <p className="mt-2 text-sm text-muted-foreground">{t("payAtVenue")}</p>}
        </div>;
}
