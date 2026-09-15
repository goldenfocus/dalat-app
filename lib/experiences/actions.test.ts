import { expect, it } from "vitest";
import { suggestsEventDiscovery } from "./actions";
it("offers discovery for a past gathering regardless of broad category", () => {
  expect(suggestsEventDiscovery("other", "University English club gathering")).toBe(true);
  expect(suggestsEventDiscovery("other", "Một sự kiện sinh viên")).toBe(true);
  expect(suggestsEventDiscovery("food", "Vegetarian buffet lunch")).toBe(false);
  expect(suggestsEventDiscovery("wellness", "A relaxing massage")).toBe(false);
});
