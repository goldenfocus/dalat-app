"use client";

import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { OriginalText } from "@/components/ui/original-text";
import { Textarea } from "@/components/ui/textarea";
import { formatVnd } from "@/lib/menu/format";
import type { MenuSection } from "@/lib/menu/types";
import { cartTotal, type ArrivalQuantities } from "./arrival-cart";

export { cartLines, cartTotal, type ArrivalQuantities } from "./arrival-cart";

export interface ArrivalMenuProps {
  sections: MenuSection[];
  quantities: ArrivalQuantities;
  onChange: (next: ArrivalQuantities) => void;
  note: string;
  onNoteChange: (next: string) => void;
  disabled?: boolean;
}

/** The same full-menu cart is used by guests and the welcome desk. */
export function ArrivalMenu({ sections, quantities, onChange, note, onNoteChange, disabled = false }: ArrivalMenuProps) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const bump = (id: string, delta: number) => onChange({
    ...quantities,
    [id]: Math.max(0, Math.min(20, (quantities[id] ?? 0) + delta)),
  });

  if (sections.length === 0) return <p className="text-muted-foreground">{t("noMenu")}</p>;

  return (
    <div className="space-y-8">
      {sections.length > 1 && (
        <nav aria-label={t("menuNav")} className="flex flex-wrap gap-x-5 border-b border-border">
          {sections.map(section => (
            <a key={section.id} href={`#arrival-menu-${section.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
              {section.title}
            </a>
          ))}
        </nav>
      )}
      {sections.map(section => (
        <section key={section.id} id={`arrival-menu-${section.id}`} className="scroll-mt-8">
          <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
          {section.note && <p className="mt-1 text-sm text-muted-foreground">{section.note}</p>}
          {section.originalTitle && (section.title !== section.originalTitle || section.note !== section.originalNote) && (
            <OriginalText text={[section.originalTitle, section.originalNote].filter(Boolean).join("\n")} />
          )}
          <ul className="mt-3 divide-y divide-border">
            {section.items.map(item => {
              const qty = quantities[item.id] ?? 0;
              return (
                <li key={item.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className={`font-medium text-foreground ${item.is_sold_out ? "line-through" : ""}`}>{item.name}</h4>
                      {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                      <p className="mt-1 text-sm font-medium tabular-nums text-muted-foreground">{formatVnd(item.price_vnd, locale)}</p>
                    </div>
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    )}
                  </div>
                  {item.originalName && (item.name !== item.originalName || item.description !== item.originalDescription) && (
                    <OriginalText text={[item.originalName, item.originalDescription].filter(Boolean).join("\n")} />
                  )}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {item.is_sold_out ? <span className="py-3 text-sm text-muted-foreground">{t("soldOut")}</span> : (
                      <>
                        {qty > 0 && (
                          <>
                            <Button type="button" size="icon" variant="ghost" className="scroll-mb-28 h-11 w-11" disabled={disabled} aria-label={t("remove", { name: item.name })} onClick={() => bump(item.id, -1)}><Minus aria-hidden="true" /></Button>
                            <output aria-label={t("quantity", { name: item.name, count: qty })} className="min-w-6 text-center font-semibold tabular-nums text-foreground">{qty}</output>
                          </>
                        )}
                        <Button type="button" size="icon" variant="outline" className="scroll-mb-28 h-11 w-11" disabled={disabled || qty >= 20} aria-label={t("add", { name: item.name })} onClick={() => bump(item.id, 1)}><Plus aria-hidden="true" /></Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">{t("noteLabel")}</span>
        <Textarea rows={2} maxLength={500} value={note} disabled={disabled} onChange={event => onNoteChange(event.target.value)} placeholder={t("notePlaceholder")} className="text-base" />
      </label>
      <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold text-foreground" aria-live="polite">
        <span>{t("total")}</span><span>{formatVnd(cartTotal(sections, quantities), locale)}</span>
      </div>
    </div>
  );
}
