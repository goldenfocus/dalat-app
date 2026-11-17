import { describe, expect, it } from "vitest";
import { cliFailure } from "./cli";
import { RetrySchedule } from "./retry-schedule";

describe("structured-output recovery", () => {
  it("does not mistake invalid structured output for an unavailable provider", () => {
    const error = cliFailure("claude", 1, JSON.stringify({
      subtype: "error_max_structured_output_retries", result: "Private source prose",
    }));
    expect(error.message).toContain("structured output");
    expect(error.message).not.toContain("unavailable");
    expect(error.message).not.toContain("Private source prose");
    expect(cliFailure("claude", 1, "not json").message).toContain("unavailable");
  });

  it("retries only the affected record in smaller groups after five seconds", () => {
    const schedule = new RetrySchedule();
    schedule.start(["event:bad"], 100);
    schedule.failed(["event:bad"], 100, false, true);
    expect(schedule.small("event:bad")).toBe(true);
    expect(schedule.deferred("event:bad", 5_099)).toBe(true);
    expect(schedule.deferred("event:bad", 5_100)).toBe(false);
    expect(schedule.deferred("event:new", 101)).toBe(false);
  });
});
