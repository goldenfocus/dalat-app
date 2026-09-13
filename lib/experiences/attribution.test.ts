import { it, expect } from "vitest";
import { attributionParts, attributedPlainText } from "./attribution";
it("links generic creator references to the actual handle without altering saved evidence", () => {
  const text =
    "The reviewer enjoyed lunch. The contributor's photos show a menu.";
  expect(attributedPlainText(text, "zan")).toBe(
    "@zan enjoyed lunch. @zan's photos show a menu.",
  );
  expect(attributionParts(text, "zan").filter((p) => p.linked)).toHaveLength(2);
});
it("never invents a handle or links a different person", () => {
  expect(attributedPlainText("The reviewer liked it.", null)).toBe(
    "The reviewer liked it.",
  );
  expect(
    attributionParts("@someoneelse liked it.", "zan").some((p) => p.linked),
  ).toBe(false);
});
it("escapes punctuation in handles and recognizes a literal current handle", () => {
  expect(attributionParts("@a.b", "a.b").filter((p) => p.linked)).toHaveLength(
    1,
  );
  expect(attributionParts("@axb", "a.b").some((p) => p.linked)).toBe(false);
});
