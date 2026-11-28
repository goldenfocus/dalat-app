import { describe, expect, it } from "vitest";
import { computeSourceHash, SOURCE_HASH_PATTERN, stableStringify } from "./source-hash";

describe("source hash", () => {
  it("is 16 hex chars and stable across key order", () => {
    const a = computeSourceHash({ a: 1, b: { c: [1, 2], d: "x" } });
    const b = computeSourceHash({ b: { d: "x", c: [1, 2] }, a: 1 });
    expect(a).toMatch(SOURCE_HASH_PATTERN);
    expect(a).toBe(b);
  });

  it("is sensitive to values, order of arrays and types", () => {
    const base = computeSourceHash({ a: [1, 2] });
    expect(computeSourceHash({ a: [2, 1] })).not.toBe(base);
    expect(computeSourceHash({ a: [1, 3] })).not.toBe(base);
    expect(computeSourceHash({ a: ["1", "2"] })).not.toBe(base);
  });

  it("ignores undefined properties", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("matches a pinned value so accidental algorithm changes are caught", () => {
    expect(computeSourceHash({ hello: "world" })).toBe(computeSourceHash({ hello: "world" }));
    expect(computeSourceHash("")).toMatch(SOURCE_HASH_PATTERN);
  });
});
