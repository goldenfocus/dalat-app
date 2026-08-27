import { describe, expect, it } from "vitest";
import {
  getDaLatIsoWeekday,
  getTonightBounds,
  getWeekendBounds,
  isEventCurrentOrFuture,
} from "./discovery-windows";

describe("Da Lat discovery windows", () => {
  it("builds tonight in Da Lat time instead of the server timezone", () => {
    const bounds = getTonightBounds(new Date("2026-08-26T16:00:00.000Z"));

    expect(bounds.start.toISOString()).toBe("2026-08-26T10:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-26T21:00:00.000Z");
  });

  it("keeps the previous evening before 4 AM", () => {
    const bounds = getTonightBounds(new Date("2026-08-26T18:30:00.000Z"));

    expect(bounds.start.toISOString()).toBe("2026-08-26T10:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-26T21:00:00.000Z");
  });

  it("includes Friday in the coming weekend", () => {
    const bounds = getWeekendBounds(new Date("2026-08-26T05:00:00.000Z"));

    expect(bounds.start.toISOString()).toBe("2026-08-27T17:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-08-30T16:59:59.999Z");
  });

  it("starts with the current day once the weekend is underway", () => {
    const saturday = getWeekendBounds(new Date("2026-08-29T05:00:00.000Z"));
    const sunday = getWeekendBounds(new Date("2026-08-30T05:00:00.000Z"));

    expect(saturday.start.toISOString()).toBe("2026-08-28T17:00:00.000Z");
    expect(sunday.start.toISOString()).toBe("2026-08-29T17:00:00.000Z");
    expect(sunday.end.toISOString()).toBe("2026-08-30T16:59:59.999Z");
  });

  it("reads event weekdays in Da Lat regardless of the host timezone", () => {
    expect(getDaLatIsoWeekday(new Date("2026-08-28T12:00:00.000Z"))).toBe(5);
  });

  it("drops ended cards but keeps events still inside the four-hour fallback", () => {
    const now = new Date("2026-08-28T15:00:00.000Z");

    expect(isEventCurrentOrFuture({
      starts_at: "2026-08-28T10:00:00.000Z",
      ends_at: null,
    }, now)).toBe(false);
    expect(isEventCurrentOrFuture({
      starts_at: "2026-08-28T12:00:00.000Z",
      ends_at: null,
    }, now)).toBe(true);
    expect(isEventCurrentOrFuture({
      starts_at: "2026-08-28T10:00:00.000Z",
      ends_at: "2026-08-28T16:00:00.000Z",
    }, now)).toBe(true);
  });
});
