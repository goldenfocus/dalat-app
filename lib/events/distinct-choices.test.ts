import { describe, expect, it } from "vitest";
import { takeDistinctEventChoices } from "./distinct-choices";

describe("takeDistinctEventChoices", () => {
  it("shows a recurring series once while preserving standalone events", () => {
    const choices = takeDistinctEventChoices([
      { id: "series-later", series_id: "weekly", starts_at: "2026-09-09T03:00:00Z" },
      { id: "one-off", series_id: null, starts_at: "2026-08-28T12:00:00Z" },
      { id: "series-first", series_id: "weekly", starts_at: "2026-09-02T03:00:00Z" },
    ], 3);

    expect(choices.map((event) => event.id)).toEqual(["one-off", "series-first"]);
  });

  it("stops after the requested number of distinct choices", () => {
    const choices = takeDistinctEventChoices([
      { id: "a", series_id: null, starts_at: "2026-08-28T12:00:00Z" },
      { id: "b", series_id: null, starts_at: "2026-08-29T12:00:00Z" },
      { id: "c", series_id: null, starts_at: "2026-08-30T12:00:00Z" },
    ], 2);

    expect(choices.map((event) => event.id)).toEqual(["a", "b"]);
  });
});
