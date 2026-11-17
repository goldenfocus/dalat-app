import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStaleBuildError, planRecovery, resetRecoveryForTests, whenReachable } from "./recovery";

describe("isStaleBuildError", () => {
  it("recognises a chunk that the current deployment no longer serves", () => {
    const chunk = new Error("Loading chunk 42 failed.");
    chunk.name = "ChunkLoadError";
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new Error("Failed to load chunk /_next/static/chunks/a.js from module 7"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://dalat.app/x.js"))).toBe(true);
  });

  it("leaves ordinary render and network errors to the soft retry", () => {
    expect(isStaleBuildError(new TypeError("network error"))).toBe(false);
    expect(isStaleBuildError(new Error("Connection closed."))).toBe(false);
    expect(isStaleBuildError("nope")).toBe(false);
  });
});

describe("planRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRecoveryForTests();
  });
  afterEach(() => vi.useRealTimers());

  it("retries once, then hands over to the visitor until the cooldown passes", () => {
    const error = new TypeError("network error");
    expect(planRecovery(error)).toBe("retry");
    // A double render of the same error does not spend the attempt.
    expect(planRecovery(error)).toBe("retry");

    // The retry came back with the very same error (a payload still cached).
    vi.advanceTimersByTime(1_000);
    expect(planRecovery(error)).toBe("manual");
    expect(planRecovery(new TypeError("network error"))).toBe("manual");

    vi.advanceTimersByTime(30_000);
    expect(planRecovery(error)).toBe("retry");
  });
});

describe("whenReachable", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("waits for the connection to return and settle", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const reached = vi.fn();
    void whenReachable(new AbortController().signal).then(reached);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(reached).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
