import type { MenuSection } from "@/lib/menu/types";

export type ArrivalQuantities = Record<string, number>;

/** Build orders from the current menu only, never stale or unavailable selections. */
export function cartLines(sections: MenuSection[], quantities: ArrivalQuantities) {
  return sections.flatMap(section => section.items).flatMap(item => {
    const requested = quantities[item.id] ?? 0;
    const qty = Number.isFinite(requested) ? Math.min(20, Math.max(0, Math.floor(requested))) : 0;
    return item.is_sold_out || qty === 0 ? [] : [{ item_id: item.id, qty }];
  });
}

export function cartTotal(sections: MenuSection[], quantities: ArrivalQuantities) {
  const prices = new Map(sections.flatMap(section => section.items).map(item => [item.id, item.price_vnd]));
  return cartLines(sections, quantities).reduce((sum, item) => sum + (prices.get(item.item_id) ?? 0) * item.qty, 0);
}
