import type { MenuSection } from "@/lib/menu/types";
import { optionPrice, readSelection } from "@/lib/menu/options";
export type ArrivalQuantities = Record<string, number>;
/** Resolve current menu prices and reject incomplete, stale or unavailable choices. */
export function cartLines(sections: MenuSection[], quantities: ArrivalQuantities) {
  const menu = new Map(sections.flatMap(s => s.items).map(i => [i.id, i]));
  return Object.entries(quantities).flatMap(([key, requested]) => {
    const line = readSelection(key);
    const item = menu.get(line.item_id);
    const qty = Number.isFinite(requested) ? Math.min(20, Math.max(0, Math.floor(requested))) : 0;
    if (!item || item.is_sold_out || !qty || optionPrice(item, line.selected_options) === null) return [];
    return [{ item_id: line.item_id, qty, ...(Object.keys(line.selected_options).length ? { selected_options: line.selected_options } : {}) }];
  });
}
export function cartTotal(sections: MenuSection[], quantities: ArrivalQuantities) {
  const menu = new Map(sections.flatMap(s => s.items).map(i => [i.id, i]));
  return cartLines(sections, quantities).reduce((sum, line) => sum + optionPrice(menu.get(line.item_id)!, line.selected_options || {})! * line.qty, 0);
}
