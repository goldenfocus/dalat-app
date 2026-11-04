import { describe, it, expect } from "vitest";
import { optionPrice, selectionKey, readSelection } from "./options";
import { cartLines, cartTotal } from "@/components/arrival/arrival-cart";
import { arrivalSchema } from "@/lib/arrival/schema";
const item = { id: "c4a1a726-3fa5-497a-9f92-6df63a19ea0c", name: "Coffee", description: null, image_url: null, tags: [], is_sold_out: false, price_vnd: 40000, option_groups: [
 { id: "temperature", choices: [{ id: "hot", price_vnd: 0 }, { id: "iced", price_vnd: 0 }] },
 { id: "milk", choices: [{ id: "standard", price_vnd: 0 }, { id: "oat", price_vnd: 5000 }] },
 { id: "beans", choices: [{ id: "house", price_vnd: 0 }, { id: "wineRobusta", price_vnd: 10000 }] },
] };
const hot = { temperature: "hot", milk: "standard", beans: "house" };
const iced = { temperature: "iced", milk: "oat", beans: "wineRobusta" };
const sections = [{ id: "s", slug: "coffee", title: "Coffee", note: null, items: [item] }];
describe("menu options", () => {
 it("requires explicit temperature and rejects unsupported options", () => {
  expect(optionPrice(item, {})).toBeNull();
  expect(optionPrice(item, { ...hot, syrup: "free" })).toBeNull();
  expect(optionPrice(item, { ...hot, milk: "almond" })).toBeNull();
 });
 it("prices upgrades from menu data", () => { expect(optionPrice(item, hot)).toBe(40000); expect(optionPrice(item, iced)).toBe(55000); });
 it("keeps different versions of a drink separate and calculates the full total", () => {
  const quantities = { [selectionKey(item.id, hot)]: 1, [selectionKey(item.id, iced)]: 2 };
  expect(cartTotal(sections, quantities)).toBe(150000);
  const lines = cartLines(sections, quantities);
  expect(lines).toHaveLength(2); expect(lines[1].selected_options).toEqual(iced);
  expect(arrivalSchema.safeParse({ requestId: crypto.randomUUID(), nickname: "Guest", practiceLanguage: "both", items: lines }).success).toBe(true);
 });
 it("canonicalizes keys irrespective of selection order", () => { expect(selectionKey(item.id, hot)).toBe(selectionKey(item.id, { beans: "house", temperature: "hot", milk: "standard" })); expect(readSelection(selectionKey(item.id, iced)).selected_options).toEqual(iced); });
 it("drops incomplete, stale and sold-out selections", () => { expect(cartLines(sections, { [item.id]: 1, missing: 3 })).toEqual([]); expect(cartLines([{ ...sections[0], items: [{ ...item, is_sold_out: true }] }], { [selectionKey(item.id, hot)]: 1 })).toEqual([]); });
});
