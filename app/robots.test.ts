import { expect, it } from "vitest";
import robots from "./robots";
it("lets search crawlers render pages and fetch public venue photos while excluding private APIs", () => {
  const rules = robots().rules as Array<{
    userAgent: string;
    allow: string[];
    disallow: string[];
  }>;
  expect(rules[0].userAgent).toBe("*");
  expect(rules[0].allow).toContain("/api/places/photo");
  expect(rules[0].disallow).not.toContain("/_next/");
  expect(rules[0].disallow).toContain("/api/");
  expect(rules[0].disallow).toContain("/de/admin/");
});


it("lets crawlers load rental listing photos while excluding owner and viewing routes", () => {
  const [rule] = robots().rules as { allow: string[]; disallow: string[] }[];
  expect(rule.allow).toContain("/api/rentals/photos/");
  expect(rule.disallow).toContain("/fr/rentals/listing/*/tour");
  expect(rule.disallow).toContain("/vi/rentals/viewings/");
  expect(rule.disallow).not.toContain("/rentals/listing/");
});
