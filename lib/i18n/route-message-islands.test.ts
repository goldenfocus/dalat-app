import { describe, expect, it, vi } from "vitest";
vi.mock("next-intl/navigation", () => ({ createNavigation: () => ({}) }));
import { extraNamespacesForPath } from "./route-message-islands";

describe("event staff discovery translations", () => {
  it("loads staff desk labels on direct and localized event visits", () => {
    for (const path of ["/events/language-exchange", "/vi/events/language-exchange"])
      expect(extraNamespacesForPath(path)).toContain("arrival");
  });
  it("keeps the discovery feed free of staff-only dictionaries", () => {
    expect(extraNamespacesForPath("/events/upcoming")).not.toContain("arrival");
  });
});
