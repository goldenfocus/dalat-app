import { describe, expect, it } from "vitest";
import { describeRRule } from "./rrule";

describe("describeRRule", () => {
  it.each([
    ["FREQ=DAILY", "Every day"],
    ["FREQ=WEEKLY", "Every week"],
    ["FREQ=MONTHLY", "Every month"],
    ["FREQ=YEARLY", "Every year"],
  ])("describes %s with a natural singular unit", (rrule, expected) => {
    expect(describeRRule(rrule)).toBe(expected);
  });
});
