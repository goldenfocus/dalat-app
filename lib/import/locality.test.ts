import { describe, expect, it } from "vitest";
import { eventLooksLocalToDalat } from "./locality";

describe("eventLooksLocalToDalat", () => {
  it("accepts Đà Lạt venue or title evidence", () => {
    expect(eventLooksLocalToDalat("Sunset hike", "Langbiang, Đà Lạt")).toBe(true);
    expect(eventLooksLocalToDalat("Da Lat jazz night", "The Hideout")).toBe(true);
  });

  it("rejects events with no locality evidence", () => {
    expect(eventLooksLocalToDalat("Saigon techno", "District 1, HCMC")).toBe(false);
    expect(eventLooksLocalToDalat("", "")).toBe(false);
  });
});
