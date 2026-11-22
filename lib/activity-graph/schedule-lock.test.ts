import { describe, expect, it } from "vitest";
import { hasLockedSchedule } from "./schedule-lock";

describe("hasLockedSchedule", () => {
  it("is false by default so official refreshes can still move a date", () => {
    expect(hasLockedSchedule(null)).toBe(false);
    expect(hasLockedSchedule({})).toBe(false);
    expect(hasLockedSchedule({ schedule_locked: false })).toBe(false);
  });

  it("holds a manually corrected schedule so Activity Graph cannot revert it", () => {
    expect(hasLockedSchedule({ schedule_locked: true })).toBe(true);
  });
});
