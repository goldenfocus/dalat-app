import { describe, it, expect } from "vitest";
import { rankVenues } from "./venue-match";
const venues = [
  { id: "pin", name: "Le Pin Café", address: "Dalat" },
  { id: "other", name: "Le Jardin", address: "Dalat" },
  { id: "accent", name: "Phố Bên Đồi", address: "" },
];
describe("conservative venue candidates", () => {
  it.each(["Le Pin", "LePin Coffee", "Le Pin Dessert", "Le Pin Dalat"])(
    "matches %s to one existing ID",
    (q) => expect(rankVenues(q, venues).map((v) => v.id)).toEqual(["pin"]),
  );
  it("reuses accent normalization", () =>
    expect(rankVenues("Pho Ben Doi", venues)[0].id).toBe("accent"));
  it("does not match generic or short ambiguous labels", () => {
    expect(rankVenues("Cafe Dalat", venues)).toEqual([]);
    expect(rankVenues("Le", venues)).toEqual([]);
  });
  it("returns competing branches as candidates, not a selection", () =>
    expect(
      rankVenues("LePin", [
        ...venues,
        { id: "second", name: "Le Pin 2", address: "Other address" },
      ]),
    ).toHaveLength(2));
});

it("handles compact full names with descriptive suffixes", () =>
  expect(
    rankVenues("LePinDessert&More Coffee", [
      { id: "pin", name: "Le Pin Dessert & More", address: "" },
    ])[0]?.id,
  ).toBe("pin"));
