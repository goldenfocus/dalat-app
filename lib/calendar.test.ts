import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import { parseCalendarDate, readCalendarState, todayInDaLat } from "./calendar";

describe("calendar wall dates", () => {
  it("starts a new week at today even when today is Sunday", () => {
    const state = readCalendarState(new URLSearchParams(), "2026-11-15");
    expect(state.view).toBe("week");
    expect(format(state.date, "yyyy-MM-dd EEE")).toBe("2026-11-15 Sun");
  });
  it("uses the DaLat date even when the visitor is still on yesterday", () => {
    expect(todayInDaLat(new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-15");
  });
  it("preserves a shared date through repeated parsing, including west of UTC", () => {
    let value = "2026-11-15";
    for (let i = 0; i < 5; i++) value = format(parseCalendarDate(value)!, "yyyy-MM-dd");
    expect(value).toBe("2026-11-15");
  });
  it("rejects invalid and overflowing dates and inverted trip intervals", () => {
    for (const value of ["2026-02-30", "2026-13-01", "tomorrow", "2026-11-15T00:00:00Z"]) {
      expect(parseCalendarDate(value)).toBeNull();
    }
    const state = readCalendarState(new URLSearchParams("date=invalid&from=2026-11-20&to=2026-11-15"), "2026-11-15");
    expect(format(state.date, "yyyy-MM-dd")).toBe("2026-11-15");
    expect(state.tripStartDate).toBeNull();
    expect(state.tripEndDate).toBeNull();
  });
});
