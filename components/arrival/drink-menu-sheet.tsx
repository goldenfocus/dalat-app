"use client";

import { DrinkMenuItem } from "./drink-menu-item";
import { DrinkSponsorLink } from "./drink-sponsor-link";
import { readSelection, optionPrice } from "@/lib/menu/options";
import { useViewer } from "@/lib/hooks/use-viewer";
import { useLocale, useTranslations } from "next-intl";
import { OriginalText } from "@/components/ui/original-text";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatVnd } from "@/lib/menu/format";
import type { ArrivalContext } from "@/lib/arrival/types";
import { cartTotal, type ArrivalQuantities } from "./arrival-menu";

export function reservationQuantities(extra: ArrivalQuantities, freeDrink: string | null) {
  return freeDrink ? { ...extra, [freeDrink]: (extra[freeDrink] || 0) + 1 } : extra;
}
export function canChooseFreeDrink(context: ArrivalContext) {
  return Boolean(context.event.sponsorship && context.sponsorEligibility?.eligible === true);
}

export function DrinkMenuSheet({ context, open, onLater, busy, failed, quantities, onChange, selected, onSelect, note, onNoteChange, onReserve, confirmLabel }: {
  context: ArrivalContext; open: boolean; onLater: () => void; busy: boolean; failed: boolean;
  quantities: ArrivalQuantities; onChange: (value: ArrivalQuantities) => void;
  selected: string | null; onSelect: (value: string | null) => void;
  note: string; onNoteChange: (value: string) => void; onReserve: () => void; confirmLabel?: string;
}) {
  const t = useTranslations("arrival.registration");
  const common = useTranslations("arrival");
  const locale = useLocale();
  const { isGodMode } = useViewer();
  const free = canChooseFreeDrink(context);
  const drinks = context.menu.flatMap(section => section.items).filter(item => !item.is_sold_out && context.event.sponsorship?.eligibleItemIds.includes(item.id));
  const drink = free ? drinks.find(item => item.id === readSelection(selected || "").item_id) : undefined;
  const drinkPrice = drink ? optionPrice(drink, readSelection(selected || "").selected_options) : null;
  const selectionReady = Boolean(free && drink && drinkPrice !== null);
  const guestTotal = cartTotal(context.menu, reservationQuantities(quantities, selectionReady ? selected : null)) - (selectionReady ? drink!.price_vnd : 0);
  const selectDrink = (key: string | null) => {
    onSelect(key);
    if (key && (quantities[key] || 0) > 19) onChange({ ...quantities, [key]: 19 });
  };
  const paidSections = context.menu.map(section => ({ ...section, items: section.items.filter(item => !free || !drinks.some(drink => drink.id === item.id) || item.id === drink?.id || Object.entries(quantities).some(([key, qty]) => qty > 0 && readSelection(key).item_id === item.id)) })).filter(section => section.items.length > 0);
  const hasExtras = Object.values(quantities).some(qty => qty > 0);
  return <Sheet open={open} onOpenChange={next => { if (!next && !busy) onLater(); }}>
    <SheetContent side="bottom" className="mx-auto flex max-h-[88dvh] max-w-xl flex-col gap-0 rounded-t-xl p-0">
      <SheetHeader className="shrink-0 border-b px-5 py-4 text-left">
        <SheetTitle className="pr-7 text-xl">{t("chooseFromMenu")}</SheetTitle>
      </SheetHeader>
      <div className="min-h-0 overflow-y-auto px-5 py-4">
        {free && drinks.length > 0 && <section className="mb-6">
          <h3 className="text-base font-semibold"><DrinkSponsorLink>{t("complimentary")}</DrinkSponsorLink></h3>
          <ul>{drinks.map(item => <DrinkMenuItem key={item.id} item={item} complimentary selected={selected} onSelect={selectDrink} quantities={quantities} onChange={onChange} disabled={busy} />)}</ul>
        </section>}
        <section>
          <h3 className="text-base font-semibold">{t("paid")}</h3>
          {paidSections.map(section => <section key={section.id} className="mt-5">
            {(!free || section.items.some(item => !context.event.sponsorship?.eligibleItemIds.includes(item.id))) && <h4 className="text-sm text-muted-foreground">{section.title}</h4>}
            {section.note && <p className="mt-1 text-sm text-muted-foreground">{section.note}</p>}
            {section.originalTitle && (section.title !== section.originalTitle || section.note !== section.originalNote) && <OriginalText text={[section.originalTitle, section.originalNote].filter(Boolean).join("\n")} />}
            <ul>{section.items.map(item => <DrinkMenuItem key={item.id} item={item} selected={null} onSelect={selectDrink} quantities={quantities} onChange={next => onChange(selected ? { ...next, [selected]: Math.min(next[selected] || 0, 19) } : next)} disabled={busy} />)}</ul>
          </section>)}
        </section>
        {(drink || hasExtras) && <details className="mt-4"><summary className="cursor-pointer py-3 text-sm">{common("noteLabel")}</summary><textarea aria-label={common("noteLabel")} rows={2} maxLength={500} value={note} disabled={busy} onChange={event => onNoteChange(event.target.value)} className="w-full rounded-lg border bg-background p-3 text-base" /></details>}

      </div>
      <div className={`shrink-0 space-y-2 border-t bg-background px-5 pt-3 ${isGodMode ? "pb-20" : "pb-[max(1rem,env(safe-area-inset-bottom))]"}`}>
        {failed && <p role="alert" className="text-sm text-destructive">{common("errorGeneric")}</p>}
        {(drink || hasExtras) && <p className="flex justify-between text-sm"><span>{t("youPay")}</span><strong>{formatVnd(guestTotal, locale)}</strong></p>}
        <Button className="min-h-12 w-full" loading={busy} disabled={busy || (!drink && !hasExtras) || Boolean(drink && !selectionReady)} onClick={onReserve}>{confirmLabel || t(drink && !hasExtras ? "reserveFreeDrink" : "reserve")}</Button>
        <Button variant="ghost" className="min-h-11 w-full" disabled={busy} onClick={onLater}>{t("chooseAtVenue")}</Button>
      </div>
    </SheetContent>
  </Sheet>;
}
