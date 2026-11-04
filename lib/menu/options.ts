import type { MenuItem } from "./types";
export type MenuSelections = Record<string, string>;
export function selectionKey(id: string, selections: MenuSelections = {}) {
  const entries = Object.entries(selections).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `${id}|${JSON.stringify(Object.fromEntries(entries))}` : id;
}
export function readSelection(key: string): { item_id: string; selected_options: MenuSelections } {
  const split = key.indexOf("|");
  if (split < 0) return { item_id: key, selected_options: {} };
  try { return { item_id: key.slice(0, split), selected_options: JSON.parse(key.slice(split + 1)) }; }
  catch { return { item_id: "", selected_options: {} }; }
}
export function optionPrice(item: MenuItem, selected: MenuSelections) {
  const groups = item.option_groups || [];
  if (Object.keys(selected).some(key => !groups.some(g => g.id === key))) return null;
  let price = item.price_vnd;
  for (const group of groups) {
    const choice = group.choices.find(c => c.id === selected[group.id]);
    if (!choice) return null;
    price += choice.price_vnd;
  }
  return price;
}
