import { describe, expect, it } from "vitest";
import { parseArgs, parseConfig } from "./config";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
};

describe("parseConfig", () => {
  it("applies defaults and falls back to the hostname", () => {
    const c = parseConfig(base, "zang.local");
    expect(c).toMatchObject({
      workerId: "zang.local",
      pollIntervalMs: 15_000,
      heartbeatIntervalMs: 30_000,
      staleAfterSeconds: 600,
    });
  });
  it("coerces numeric env strings and honours RECAP_WORKER_ID", () => {
    const c = parseConfig({ ...base, RECAP_WORKER_ID: "mini", RECAP_POLL_INTERVAL_MS: "5000" }, "h");
    expect(c.workerId).toBe("mini");
    expect(c.pollIntervalMs).toBe(5000);
  });
  it("rejects a missing URL without echoing the secret", () => {
    const secret = "s3cret-".repeat(6);
    let message = "";
    try {
      parseConfig({ SUPABASE_SERVICE_ROLE_KEY: secret }, "h");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain(secret);
  });
  it("requires the stale timeout to exceed 3 heartbeats", () => {
    expect(() =>
      parseConfig({ ...base, RECAP_HEARTBEAT_INTERVAL_MS: "60000", RECAP_STALE_AFTER_SECONDS: "120" }, "h"),
    ).toThrow(/RECAP_STALE_AFTER_SECONDS/);
  });
});

describe("parseArgs", () => {
  it("defaults to a single pass over recap_short", () => {
    expect(parseArgs([])).toEqual({ mode: "once", dryRun: false, kinds: ["recap_short"] });
  });
  it("parses flags and both --kinds spellings", () => {
    expect(parseArgs(["--loop", "--dry-run", "--kinds=a_b,c_d"])).toEqual({
      mode: "loop",
      dryRun: true,
      kinds: ["a_b", "c_d"],
    });
    expect(parseArgs(["--kinds", "x_y"]).kinds).toEqual(["x_y"]);
  });
  it("rejects bad input", () => {
    expect(() => parseArgs(["--once", "--loop"])).toThrow();
    expect(() => parseArgs(["--kinds", "Bad Kind"])).toThrow();
    expect(() => parseArgs(["--wat"])).toThrow();
  });
});
