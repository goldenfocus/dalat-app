"use client";
import { useLocale, useTranslations } from "next-intl";
import { formatVnd } from "@/lib/menu/format";
import type { MenuSection } from "@/lib/menu/types";
import { cartTotal, type ArrivalQuantities } from "./arrival-cart";

export function sponsoredItemId(sections: MenuSection[], quantities: ArrivalQuantities, eligible: string[], selected: string | null) {
  const choices = sections.flatMap(section => section.items).filter(item => eligible.includes(item.id) && !item.is_sold_out && (quantities[item.id] || 0) > 0);
  return choices.find(item => item.id === selected)?.id || choices[0]?.id || null;
}
export function SponsoredCart({ sections, quantities, eligible, selected, onSelect }: {
  sections: MenuSection[]; quantities: ArrivalQuantities; eligible: string[]; selected: string | null; onSelect: (id: string) => void;
}) {
  const t = useTranslations("arrival.registration");
  const locale = useLocale();
  const id = sponsoredItemId(sections, quantities, eligible, selected);
  const choices = sections.flatMap(section => section.items).filter(item => eligible.includes(item.id) && (quantities[item.id] || 0) > 0 && !item.is_sold_out);
  const covered = choices.find(item => item.id === id)?.price_vnd || 0;
  return <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
    <p className="font-semibold">{t("complimentary")}</p>
    {choices.length > 1 && <label className="block space-y-2"><span className="text-sm">{t("chooseCoveredDrink")}</span><select value={id || ""} onChange={event => onSelect(event.target.value)} className="min-h-12 w-full rounded-md border bg-background px-3">{choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <div className="flex justify-between gap-3 text-sm"><span>{t("coveredByEzviet")}</span><span>{formatVnd(covered, locale)}</span></div>
    <div className="flex justify-between gap-3 font-semibold"><span>{t("youPay")}</span><span>{formatVnd(Math.max(0, cartTotal(sections, quantities) - covered), locale)}</span></div>
    <p className="text-sm text-muted-foreground">{t("extrasHint")}</p>
  </section>;
}
