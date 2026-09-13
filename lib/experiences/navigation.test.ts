import { describe, expect, it } from "vitest";
import { isExperienceEditorPath, isExperiencePath } from "./navigation";
describe("PWA recording update guard", () => {
  it("protects localized new and existing drafts, while public browsing can update", () => {
    for (const path of [
      "/experiences/new",
      "/experiences/a/edit",
      "/vi/experiences/a/edit/",
      "/fr/experiences/new",
    ])
      expect(isExperienceEditorPath(path)).toBe(true);
    for (const path of [
      "/",
      "/experiences",
      "/experiences/a",
      "/vi/events/new",
    ])
      expect(isExperienceEditorPath(path)).toBe(false);
  });
});

it("keeps unrelated Moment creation off Experience surfaces", () => {
  expect(isExperiencePath("/experiences")).toBe(true);
  expect(isExperiencePath("/vi/experiences/abc")).toBe(true);
  expect(isExperiencePath("/moments")).toBe(false);
  expect(isExperiencePath("/experiences-other")).toBe(false);
});
