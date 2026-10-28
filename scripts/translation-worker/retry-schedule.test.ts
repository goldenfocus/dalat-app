import { describe, expect, it } from "vitest";
import { RetrySchedule } from "./retry-schedule";

describe("translation retry fairness", () => {
  it("rotates failed newest records behind untouched content, including after restart", () => {
    const state = new RetrySchedule();
    state.start(["events:newest"], 1000);
    state.failed(["events:newest"], 2000, true);
    const restored = new RetrySchedule(
      JSON.parse(JSON.stringify(state.snapshot())),
    );
    expect(
      ["events:newest", "events:older", "events:new-input"].sort(
        (a, b) => restored.priority(a) - restored.priority(b),
      ),
    ).toEqual(["events:older", "events:new-input", "events:newest"]);
    expect(restored.deferred("events:newest", 3000)).toBe(true);
    expect(restored.deferred("events:older", 3000)).toBe(false);
    expect(restored.deferred("events:newest", 902001)).toBe(false);
    expect(restored.small("events:newest")).toBe(true);
  });

  it("keeps source tables distinct and retains smaller retries until full success", () => {
    const state = new RetrySchedule();
    state.start(["moment_metadata:id"], 1000);
    state.failed(["moment_metadata:id"], 2000, true);
    expect(state.small("moments:id")).toBe(false);
    state.start(["moment_metadata:id"], 1_000_000);
    expect(state.small("moment_metadata:id")).toBe(true);
    state.complete(["moment_metadata:id"]);
    expect(state.snapshot()).toEqual({});
  });

  it("defers only failed records and does not shrink non-timeout failures", () => {
    const state = new RetrySchedule();
    state.start(["events:bad", "events:good"], 1000);
    state.failed(["events:bad"], 2000, false);
    expect(state.deferred("events:good", 3000)).toBe(false);
    expect(state.small("events:bad")).toBe(false);
    expect(
      () => new RetrySchedule({ broken: { attemptedAt: "bad" } }),
    ).toThrow();
  });
});
