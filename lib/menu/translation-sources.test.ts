import { it, expect } from "vitest";
import { currentOverrides } from "./format";
it("does not revive stale locales when only one language is re-reviewed", () => {
  const edits = { de: "Kalte Suppe", fr: "Soupe chaude" };
  expect(
    currentOverrides(edits, "Cold soup", { de: "Cold soup", fr: "Hot soup" }),
  ).toEqual({ de: "Kalte Suppe" });
  expect(
    currentOverrides(edits, "New soup", { de: "Cold soup", fr: "Hot soup" }),
  ).toEqual({});
  expect(edits.fr).toBe("Soupe chaude");
});
