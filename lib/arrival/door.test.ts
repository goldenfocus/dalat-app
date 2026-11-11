import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { doorKey, validDoorKey } from "./door";

const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-secret"; });
afterEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = original; });

describe("door key", () => {
  it("is a stable twenty-character key bound to one event", () => {
    const key = doorKey("event-a");
    expect(key).toMatch(/^[a-f0-9]{20}$/);
    expect(doorKey("event-a")).toBe(key);
    expect(doorKey("event-b")).not.toBe(key);
    expect(validDoorKey("event-a", key)).toBe(true);
    expect(validDoorKey("event-b", key)).toBe(false);
  });
  it("depends on the server secret and never contains it", () => {
    const key = doorKey("event-a");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "another-secret";
    expect(doorKey("event-a")).not.toBe(key);
    expect(validDoorKey("event-a", key)).toBe(false);
    expect(key).not.toContain("test-service-secret");
  });
  it("rejects malformed, missing and wrong-length keys without throwing", () => {
    const key = doorKey("event-a");
    for (const value of [undefined, null, "", 1, key.slice(1), `${key}0`, key.toUpperCase(), "z".repeat(20), { key }]) expect(validDoorKey("event-a", value)).toBe(false);
  });
  it("fails closed when the server secret is not configured", () => {
    const key = doorKey("event-a");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(validDoorKey("event-a", key)).toBe(false);
    expect(() => doorKey("event-a")).toThrow("unavailable");
  });
});
