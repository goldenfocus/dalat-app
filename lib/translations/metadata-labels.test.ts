import { describe, expect, it } from "vitest";
import { metadataLabels } from "./metadata-labels";
describe("metadata label source", () => {
  it("keeps the shared group order and exact bytes, including duplicate labels", () => {
    const row = {
      ai_tags: ["  coffee  ", "community"],
      detected_objects: ["coffee"],
      location_hints: ["Đà Lạt"],
      mood: " relaxed ",
      detected_text: ["OPEN\n7:00", "coffee"],
    };
    const before = JSON.stringify(row);
    expect(metadataLabels(row)).toEqual([
      "  coffee  ",
      "community",
      "coffee",
      "Đà Lạt",
      " relaxed ",
      "OPEN\n7:00",
      "coffee",
    ]);
    expect(JSON.stringify(row)).toBe(before);
  });
  it("drops invalid or blank leaves without shifting valid groups inconsistently", () => {
    expect(
      metadataLabels({
        ai_tags: [null, "", " ", 2, "coffee"],
        detected_objects: "not an array",
        location_hints: [false, "city"],
        mood: 42,
        detected_text: [undefined, "sign"],
      }),
    ).toEqual(["coffee", "city", "sign"]);
  });
  it("does not translate colors or unrelated metadata", () => {
    const row: Record<string, unknown> = {
      dominant_colors: ["#ffffff"],
      mood: "  ",
      ai_tags: null,
    };
    expect(metadataLabels(row)).toEqual([]);
  });
});
