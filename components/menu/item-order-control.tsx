"use client";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "@/lib/menu/types";
import { optionPrice, readSelection, selectionKey, type MenuSelections } from "@/lib/menu/options";
import { formatVnd } from "@/lib/menu/format";
import { ItemOptions } from "./item-options";
export function ItemOrderControl({ item, quantities, onChange, disabled = false }: { item: MenuItem; quantities: Record<string, number>; onChange: (next: Record<string, number>) => void; disabled?: boolean }) {
  const t = useTranslations("arrival");
  const options = useTranslations("menuOptions");
  const locale = useLocale();
  const [selected, setSelected] = useState<MenuSelections>(() => Object.fromEntries((item.option_groups || []).filter(g => g.default).map(g => [g.id, g.default!])));
  const key = selectionKey(item.id, selected);
  const price = optionPrice(item, selected);
  const lines = Object.entries(quantities).filter(([k, q]) => q > 0 && readSelection(k).item_id === item.id);
  const count = lines.reduce((sum, [, q]) => sum + q, 0);
  const bump = (k: string, d: number) => onChange({ ...quantities, [k]: Math.max(0, Math.min(20, (quantities[k] || 0) + d)) });
  if (item.is_sold_out) return <p className="mt-2 text-sm text-muted-foreground">{t("soldOut")}</p>;
  return <>
    <ItemOptions item={item} value={selected} onChange={setSelected} disabled={disabled} />
    {lines.map(([k, q]) => <div key={k} className="mt-2 flex items-center justify-between gap-2 text-sm">
      <span>{Object.values(readSelection(k).selected_options).map(v => options(v)).join(" · ")}</span>
      <div className="flex shrink-0 items-center gap-2"><Button type="button" size="icon" variant="ghost" className="h-11 w-11" aria-label={t("remove", { name: item.name })} disabled={disabled} onClick={() => bump(k, -1)}><Minus /></Button><output aria-label={t("quantity", { name: item.name, count: q })}>{q}</output></div>
    </div>)}
    <div className="mt-2 flex items-center justify-end gap-3">
      {price !== null && price !== item.price_vnd && <span className="text-sm tabular-nums">{formatVnd(price, locale)}</span>}
      <Button type="button" size="icon" variant="outline" className="scroll-mb-28 h-11 w-11" disabled={disabled || price === null || count >= 20} aria-label={t("add", { name: item.name })} onClick={() => bump(key, 1)}><Plus /></Button>
    </div>
  </>;
}
