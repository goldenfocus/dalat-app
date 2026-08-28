import { describe, expect, it } from "vitest";
import { getEventDateDisplay } from "./event-date-range";

describe("getEventDateDisplay", () => {
  it("keeps a same-day end time on the start date", async () => {
    const display = await getEventDateDisplay(
      "2026-08-27T12:00:00Z",
      "2026-08-27T15:00:00Z",
      "en"
    );

    expect(display).toEqual({
      spansMultipleDays: false,
      startDate: "Thursday, August 27, 2026",
      startTime: "7:00 PM",
      endDate: null,
      endTime: "10:00 PM",
    });
  });

  it("shows both dates for a multi-day festival", async () => {
    const display = await getEventDateDisplay(
      "2026-12-19T13:00:00Z",
      "2026-12-31T15:00:00Z",
      "en"
    );

    expect(display.spansMultipleDays).toBe(true);
    expect(display.startDate).toBe("Saturday, December 19, 2026");
    expect(display.startTime).toBe("8:00 PM");
    expect(display.endDate).toBe("Thursday, December 31, 2026");
    expect(display.endTime).toBe("10:00 PM");
  });

  it("compares calendar days in Đà Lạt rather than UTC", async () => {
    const display = await getEventDateDisplay(
      "2026-08-27T16:30:00Z",
      "2026-08-27T18:30:00Z",
      "en"
    );

    expect(display.spansMultipleDays).toBe(true);
    expect(display.startDate).toBe("Thursday, August 27, 2026");
    expect(display.endDate).toBe("Friday, August 28, 2026");
  });
});
