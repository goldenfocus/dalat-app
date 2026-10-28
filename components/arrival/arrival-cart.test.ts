import { describe, expect, it } from "vitest";
import type { MenuSection } from "@/lib/menu/types";
import { cartLines, cartTotal } from "./arrival-cart";

const menu: MenuSection[] = [{
  id: "drinks", slug: "drinks", title: "Drinks", note: null,
  items: [
    { id: "coffee", name: "Coffee", description: null, price_vnd: 35000, tags: [], image_url: null, is_sold_out: false },
    { id: "ginger", name: "Ginger beer", description: null, price_vnd: 45000, tags: [], image_url: null, is_sold_out: true },
  ],
}];

describe("arrival cart", () => {
  it("never submits a sold-out or removed menu item and excludes them from the total", () => {
    const quantities = { coffee: 2, ginger: 3, removed: 5 };
    expect(cartLines(menu, quantities)).toEqual([{ item_id: "coffee", qty: 2 }]);
    expect(cartTotal(menu, quantities)).toBe(70000);
  });

  it("keeps quantities within the server order limit", () => {
    expect(cartLines(menu, { coffee: 100 })).toEqual([{ item_id: "coffee", qty: 20 }]);
    for (const count of [NaN, Infinity, -1, 0, 0.2]) expect(cartLines(menu, { coffee: count })).toEqual([]);
  });
});
