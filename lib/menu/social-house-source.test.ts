import { expect, it } from "vitest";
import { parseSocialHouseMenu } from "./social-house-source";
const makeMenu = () => ({ "@type": "Menu", url: "https://socialhousedalat.com/menu/", hasMenuSection: [{
  name: "Vietnamese Coffee", description: "Wine-fermented Robusta +10,000 VND.",
  hasMenuItem: Array.from({ length: 35 }, (_, i) => ({ name: `Coffee ${i} (hot / iced)`, offers: { price: "40000", priceCurrency: "VND" } })),
}] });
const html = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
it("extracts exact source prices and only supported options", () => {
  const sections = parseSocialHouseMenu(html(makeMenu()));
  expect(sections[0].slug).toBe("coffee");
  expect(sections[0].items[0]).toMatchObject({ name: "Coffee 0", price: 40000 });
  expect(sections[0].items[0].option_groups.map(g => g.id)).toEqual(["temperature", "beans"]);
  expect(sections[0].items[0].option_groups[1].choices[1]).toEqual({ id: "wineRobusta", price_vnd: 10000 });
});
it("refuses partial, malformed or mispriced source menus", () => {
  expect(() => parseSocialHouseMenu("<html>temporarily unavailable</html>")).toThrow();
  const menu = makeMenu(); menu.hasMenuSection[0].hasMenuItem.pop();
  expect(() => parseSocialHouseMenu(html(menu))).toThrow(/count/);
  menu.hasMenuSection[0].hasMenuItem[0].offers.priceCurrency = "USD";
  expect(() => parseSocialHouseMenu(html(menu))).toThrow(/price/);
});
it("refuses duplicates instead of overwriting a dish", () => {
  const menu = makeMenu(); menu.hasMenuSection[0].hasMenuItem[1] = menu.hasMenuSection[0].hasMenuItem[0];
  expect(() => parseSocialHouseMenu(html(menu))).toThrow(/duplicated/);
});
