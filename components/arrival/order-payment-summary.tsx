"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatVnd } from "@/lib/menu/format";
import type { ArrivalOrder } from "@/lib/arrival/types";

export function OrderPaymentSummary({ order, staff = false }: { order: ArrivalOrder; staff?: boolean }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const covered = order.sponsor_status !== "void" && (order.sponsored_vnd ?? 0) > 0;
  return <div className="space-y-2 border-t pt-3 text-sm">
    <p className="flex justify-between gap-3"><span>{t("total")}</span><span className="tabular-nums">{formatVnd(order.total_vnd, locale)}</span></p>
    {covered && <>
      <p className="flex justify-between gap-3 text-primary"><span>{t("sponsorCovered")}</span><span className="tabular-nums">−{formatVnd(order.sponsored_vnd ?? 0, locale)}</span></p>
      <p className="text-xs text-muted-foreground">{t(staff ? "sponsorNoCollect" : "sponsorGuestCoveredHint")}</p>
    </>}
    <p className="flex justify-between gap-3 font-semibold"><span>{t("sponsorGuestDue")}</span><span className="tabular-nums">{formatVnd(order.guest_due_vnd ?? order.total_vnd, locale)}</span></p>
  </div>;
}
