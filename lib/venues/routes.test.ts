import { describe, expect, it } from "vitest";
import { getVenuePastEventsPath } from "./routes";

describe("getVenuePastEventsPath", () => {
  it("targets the dedicated venue past-events route", () => {
    expect(getVenuePastEventsPath("le-pin-dessert-more")).toBe(
      "/venues/le-pin-dessert-more/events"
    );
  });
});
