import { describe, expect, it } from "vitest";
import { ACTIVE_STATUSES, canTransition, retryDelayMs, statusAfterFailure } from "./backoff";

describe("retryDelayMs (mirrors render_job_backoff in SQL)", () => {
  it("doubles from 60 s and caps at 1 h", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelayMs)).toEqual([
      60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000,
    ]);
  });
  it("treats 0 like the first attempt", () => {
    expect(retryDelayMs(0)).toBe(60_000);
  });
});

describe("statusAfterFailure", () => {
  it("re-queues until attempts reach max, then dead", () => {
    expect(statusAfterFailure({ attempts: 1, maxAttempts: 3, retryable: true })).toBe("queued");
    expect(statusAfterFailure({ attempts: 3, maxAttempts: 3, retryable: true })).toBe("dead");
  });
  it("marks non-retryable failures failed", () => {
    expect(statusAfterFailure({ attempts: 1, maxAttempts: 3, retryable: false })).toBe("failed");
  });
});

describe("canTransition", () => {
  it("allows the documented path and nothing out of terminal states", () => {
    expect(canTransition("queued", "claimed")).toBe(true);
    expect(canTransition("claimed", "rendering")).toBe(true);
    expect(canTransition("rendering", "uploading")).toBe(true);
    expect(canTransition("uploading", "done")).toBe(true);
    expect(canTransition("queued", "done")).toBe(false);
    expect(canTransition("rendering", "claimed")).toBe(false);
    for (const s of ["done", "failed", "dead"] as const) expect(canTransition(s, "queued")).toBe(false);
  });
  it("every active status can be re-queued", () => {
    for (const s of ACTIVE_STATUSES) expect(canTransition(s, "queued")).toBe(true);
  });
});
