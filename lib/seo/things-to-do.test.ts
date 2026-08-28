import { describe, expect, it } from "vitest";
import {
  buildThingsToDoSchemas,
  getThingsToDoCopy,
  THINGS_TO_DO_PATH,
} from "./things-to-do";

describe("things-to-do guide", () => {
  it("targets the exact English search intent with substantial choices", () => {
    const copy = getThingsToDoCopy("en");

    expect(copy.title.toLowerCase()).toBe("things to do in dalat");
    expect(copy.items).toHaveLength(8);
    expect(new Set(copy.items.map((item) => item.href)).size).toBe(8);
    expect(copy.faqs.length).toBeGreaterThanOrEqual(4);
  });

  it("uses non-redirecting URLs for the default locale schema", () => {
    const [page, breadcrumbs] = buildThingsToDoSchemas("en") as Array<
      Record<string, any>
    >;

    expect(page.url).toBe(`https://dalat.app${THINGS_TO_DO_PATH}`);
    expect(page.url).not.toContain("/en/");
    expect(breadcrumbs.itemListElement[0].item).toBe("https://dalat.app");
  });

  it("uses locale-prefixed URLs for Vietnamese schema", () => {
    const [page] = buildThingsToDoSchemas("vi") as Array<Record<string, any>>;

    expect(page.url).toBe(`https://dalat.app/vi${THINGS_TO_DO_PATH}`);
    expect(page.inLanguage).toBe("vi");
  });
});
