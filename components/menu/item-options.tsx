"use client";
import { useLocale, useTranslations } from "next-intl";
import type { MenuItem } from "@/lib/menu/types";
import type { MenuSelections } from "@/lib/menu/options";
import { formatVnd } from "@/lib/menu/format";
export function ItemOptions({ item, value, onChange, disabled }: { item: MenuItem; value: MenuSelections; onChange: (v: MenuSelections) => void; disabled?: boolean }) {
  const t = useTranslations("menuOptions");
  const locale = useLocale();
  return <div className="mt-3 grid gap-3 sm:grid-cols-2">{(item.option_groups || []).map(group => <label key={group.id} className="block space-y-1 text-sm">
    <span className="font-medium">{t(group.id)}</span>
    <select aria-label={`${item.name}: ${t(group.id)}`} value={value[group.id] || ""} disabled={disabled} onChange={e => onChange({ ...value, [group.id]: e.target.value })} className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground">
      <option value="" disabled>{t("choose")}</option>
      {group.choices.map(choice => <option key={choice.id} value={choice.id}>{t(choice.id)}{choice.price_vnd ? ` (+${formatVnd(choice.price_vnd, locale)})` : ""}</option>)}
    </select>
  </label>)}</div>;
}
