import { describe, expect, it } from "vitest";
import { formatVnd, pickLocalized } from "./format";
import { generateMenuSchema, venueMenuPath } from "./schema";
import type { MenuSection } from "./types";

describe("formatVnd", () => {
  it("groups thousands and trails the dong sign", () => {
    expect(formatVnd(58000, "en")).toBe("58,000 ₫");
    expect(formatVnd(58000, "vi")).toBe("58.000 ₫");
  });
  it("survives an unknown locale", () => {
    expect(formatVnd(1000, "zz-invalid-locale-xx")).toBe("1,000 ₫");
  });
});

describe("pickLocalized", () => {
  it("prefers the locale override, then the venue's wording", () => {
    expect(pickLocalized({ vi: "Cà phê đen" }, "vi", "Black Coffee")).toBe("Cà phê đen");
    expect(pickLocalized({ vi: "  " }, "vi", "Black Coffee")).toBe("Black Coffee");
    expect(pickLocalized({}, "ko", "Black Coffee")).toBe("Black Coffee");
    expect(pickLocalized(null, "ko", null)).toBeNull();
  });
});

describe("generateMenuSchema", () => {
  const sections: MenuSection[] = [
    {
      id: "s1",
      slug: "coffee",
      title: "Coffee",
      note: "Beans from Zanya",
      items: [
        { id: "i1", name: "Black Coffee", description: null, price_vnd: 34000, tags: [], image_url: null, is_sold_out: false },
        { id: "i2", name: "Veg Burrito", description: "Tofu", price_vnd: 115000, tags: ["vegetarian"], image_url: null, is_sold_out: true },
      ],
    },
  ];
  const schema = generateMenuSchema({ slug: "social-house-dalat", name: "Social House Dalat" }, sections, "en");

  it("emits Menu → MenuSection → MenuItem with VND offers", () => {
    expect(schema["@type"]).toBe("Menu");
    expect(schema.url).toContain(venueMenuPath("social-house-dalat"));
    const items = schema.hasMenuSection[0].hasMenuItem;
    expect(items[0].offers).toMatchObject({ price: 34000, priceCurrency: "VND", availability: "https://schema.org/InStock" });
    expect(items[1].offers.availability).toBe("https://schema.org/OutOfStock");
    expect(items[1].suitableForDiet).toBe("https://schema.org/VegetarianDiet");
  });
});
