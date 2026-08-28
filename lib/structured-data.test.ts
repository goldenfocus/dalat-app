import { describe, expect, it } from "vitest";
import {
  generateBreadcrumbSchema,
  generateWebSiteSchema,
} from "./structured-data";

describe("localized structured-data URLs", () => {
  it("keeps default-English schema URLs on non-redirecting root paths", () => {
    const breadcrumb = generateBreadcrumbSchema(
      [
        { name: "Home", url: "/" },
        { name: "Things to do", url: "/things-to-do-in-dalat" },
      ],
      "en",
    );
    const website = generateWebSiteSchema("en");

    expect(breadcrumb.itemListElement[0].item).toBe("https://dalat.app/");
    expect(breadcrumb.itemListElement[1].item).toBe(
      "https://dalat.app/things-to-do-in-dalat",
    );
    expect(website.url).toBe("https://dalat.app");
    expect(website.potentialAction.target.urlTemplate).toBe(
      "https://dalat.app/search/{search_term_string}",
    );
  });

  it("preserves locale prefixes for non-default languages", () => {
    const website = generateWebSiteSchema("vi");

    expect(website.url).toBe("https://dalat.app/vi");
    expect(website.potentialAction.target.urlTemplate).toBe(
      "https://dalat.app/vi/search/{search_term_string}",
    );
  });
});
