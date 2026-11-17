import { describe, expect, it } from "vitest";
import { cliFailure, validateCliOutput } from "./cli";
import { rowResponseSchema } from "./work-plan";
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

  it("enforces the exact locale and field schema for ordinary JSON retries", () => {
    const schema = rowResponseSchema({ title: "Source" }, ["en", "vi"], true);
    const value = { source_locale: "vi", translations: { en: { title: "Source" }, vi: { title: "Nguồn" } }, approved: true, issues: [] };
    expect(validateCliOutput(value, schema)).toEqual(value);
    expect(() => validateCliOutput({ ...value, translations: { en: { title: "Source" } } }, schema)).toThrow();
    expect(() => validateCliOutput({ ...value, source_locale: "made-up" }, schema)).toThrow();
    expect(() => validateCliOutput({ ...value, approved: "true" }, schema)).toThrow();
    expect(() => validateCliOutput({ ...value, extra: "not allowed" }, schema)).toThrow();
  });
});
