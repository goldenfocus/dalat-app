"use client";

import { Check, Coffee, CupSoda, Plus, UtensilsCrossed } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { OriginalText } from "@/components/ui/original-text";
import { ItemOptions } from "@/components/menu/item-options";
import { ItemOrderControl } from "@/components/menu/item-order-control";
import { formatVnd } from "@/lib/menu/format";
import { readSelection, selectionKey } from "@/lib/menu/options";
import type { MenuItem } from "@/lib/menu/types";
import type { ArrivalQuantities } from "./arrival-cart";

export function DrinkMenuItem({ item, complimentary = false, selected, onSelect, quantities, onChange, disabled }: {
  item: MenuItem; complimentary?: boolean; selected: string | null; onSelect: (key: string | null) => void;
  quantities: ArrivalQuantities; onChange: (next: ArrivalQuantities) => void; disabled: boolean;
}) {
  const t = useTranslations("arrival.registration");
  const locale = useLocale();
  const active = complimentary && readSelection(selected || "").item_id === item.id;
  const itemName = item.originalName || item.name;
  const count = Object.entries(quantities).filter(([key]) => readSelection(key).item_id === item.id).reduce((sum, [, qty]) => sum + qty, 0);
  const Icon = /coffee|brew|moka/i.test(itemName) ? Coffee : /cake|cookie|brownie|burrito|soup|dinner|toast|taco|torte/i.test(itemName) ? UtensilsCrossed : CupSoda;
  const defaults = Object.fromEntries((item.option_groups || []).filter(group => group.default).map(group => [group.id, group.default!]));
  const header = <div className="flex items-center gap-4">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
        {item.image_url ?
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon aria-hidden className="h-8 w-8" strokeWidth={1.4} />}
      </div>
      <div className="min-w-0 flex-1"><h4 className="font-semibold leading-snug">{item.name}</h4><p className={`mt-1 text-sm font-medium tabular-nums ${complimentary ? "text-primary" : "text-muted-foreground"}`}>{complimentary ? t("free") : formatVnd(item.price_vnd, locale)}</p></div>
      {!complimentary && <span className="flex items-center gap-2">{count > 0 && <span className="text-sm font-semibold tabular-nums">{count}</span>}<Plus aria-hidden className="h-5 w-5 shrink-0" /></span>}
    </div>;
  const description = <>
    {item.description && <p className="py-2 text-sm text-muted-foreground">{item.description}</p>}
    {item.originalName && (item.originalName !== item.name || item.originalDescription !== item.description) && <OriginalText text={[item.originalName, item.originalDescription].filter(Boolean).join("\n")} />}
  </>;
  if (!complimentary) return <li className="border-b border-border py-4 last:border-0"><details>
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{header}</summary>
    <div className="mt-3">{description}<ItemOrderControl item={item} quantities={quantities} onChange={onChange} disabled={disabled} /></div>
  </details></li>;
  return <li className={`border-b border-border py-4 last:border-0 ${active ? "bg-primary/5" : ""}`}>
    <div className="flex items-center gap-3"><div className="min-w-0 flex-1">{header}</div>
      {complimentary && <Button type="button" size="icon" variant={active ? "default" : "outline"} className="h-11 w-11 shrink-0 rounded-full" disabled={disabled || item.is_sold_out} aria-label={item.name} aria-pressed={active} onClick={() => onSelect(active ? null : selectionKey(item.id, defaults))}>
        {active ? <Check aria-hidden className="h-5 w-5" /> : <span aria-hidden className="h-4 w-4 rounded-full border border-current" />}
      </Button>}
    </div>
    {(item.description || item.originalName && item.originalName !== item.name) && <details className="ml-24 mt-2 text-sm text-muted-foreground"><summary className="min-h-8 cursor-pointer">{t("itemDetails")}</summary>
      {description}
    </details>}
    {active && <div className="mt-3"><ItemOptions item={item} value={readSelection(selected || "").selected_options} onChange={value => onSelect(selectionKey(item.id, value))} disabled={disabled} /></div>}
  </li>;
}
