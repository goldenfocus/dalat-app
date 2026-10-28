"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OriginalText } from "@/components/ui/original-text";
import { formatVnd } from "@/lib/menu/format";
import type { ArrivalContext } from "@/lib/arrival/types";
import { ArrivalMenu, cartTotal, type ArrivalQuantities } from "./arrival-menu";

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
  const free = canChooseFreeDrink(context);
  const drinks = context.menu.flatMap(section => section.items).filter(item => !item.is_sold_out && context.event.sponsorship?.eligibleItemIds.includes(item.id));
  const drink = drinks.find(item => item.id === selected);
  const hasExtras = Object.values(quantities).some(qty => qty > 0);
  return <Sheet open={open} onOpenChange={next => { if (!next && !busy) onLater(); }}>
    <SheetContent side="bottom" className="mx-auto flex max-h-[88dvh] max-w-xl flex-col gap-0 rounded-t-xl p-0">
      <SheetHeader className="shrink-0 border-b px-5 py-4 text-left">
        <SheetTitle className="pr-7 text-xl">{t(free ? "chooseFreeDrink" : "chooseFromMenu")}</SheetTitle>
        <p className="text-sm text-muted-foreground">{free ? t("firstRsvps", { count: context.event.sponsorship?.rsvpLimit ?? 100 }) : context.event.orderingEnabled && context.menu.length ? t("venuePurchase") : common("noMenu")}</p>
      </SheetHeader>
      <div className="min-h-0 overflow-y-auto px-5 py-4">
        {free ? <div className="space-y-4">
          <label className="block space-y-2"><span className="text-sm font-medium">{t("drink")}</span>
            <select value={selected || ""} onChange={event => { const id = event.target.value || null; onSelect(id); if (id && (quantities[id] || 0) > 19) onChange({ ...quantities, [id]: 19 }); }} disabled={busy} className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base">
              <option value="">{t("chooseFreeDrink")}</option>
              {drinks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {drink && <div className="space-y-2 rounded-lg bg-muted p-3">
            {drink.description && <p className="text-sm">{drink.description}</p>}
            <p className="flex items-center gap-3"><span className="text-sm text-muted-foreground line-through">{formatVnd(drink.price_vnd, locale)}</span><strong>{formatVnd(0, locale)}</strong></p>
            {drink.originalName && (drink.originalName !== drink.name || drink.originalDescription !== drink.description) && <OriginalText text={[drink.originalName, drink.originalDescription].filter(Boolean).join("\n")} />}
          </div>}
          <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("addExtras")}</summary>
            <ArrivalMenu sections={context.menu} quantities={quantities} onChange={next => onChange(selected ? { ...next, [selected]: Math.min(next[selected] || 0, 19) } : next)} note={note} onNoteChange={onNoteChange} disabled={busy} />
          </details>
        </div> : <ArrivalMenu sections={context.menu} quantities={quantities} onChange={onChange} note={note} onNoteChange={onNoteChange} disabled={busy} />}
      </div>
      <div className="shrink-0 space-y-2 border-t bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {failed && <p role="alert" className="text-sm text-destructive">{common("errorGeneric")}</p>}
        {(drink || hasExtras) && <p className="flex justify-between text-sm"><span>{t("youPay")}</span><strong>{formatVnd(cartTotal(context.menu, quantities), locale)}</strong></p>}
        <Button className="min-h-12 w-full" loading={busy} disabled={busy || (!drink && !hasExtras)} onClick={onReserve}>{confirmLabel || t(drink && !hasExtras ? "reserveFreeDrink" : "reserve")}</Button>
        <Button variant="ghost" className="min-h-11 w-full" disabled={busy} onClick={onLater}>{t("chooseAtVenue")}</Button>
      </div>
    </SheetContent>
  </Sheet>;
}
