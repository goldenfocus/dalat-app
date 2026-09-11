import { describe, expect, it } from "vitest";
import { evaluateDiscoveryHorizon } from "./horizon";

const now = new Date("2026-09-11T05:00:00.000Z");

describe("evaluateDiscoveryHorizon", () => {
  it("admits an event later this month", () => {
    expect(
      evaluateDiscoveryHorizon(new Date("2026-09-20T12:00:00.000Z"), now),
    ).toEqual({ ok: true });
  });

  it("rejects a past event", () => {
    const result = evaluateDiscoveryHorizon(
      new Date("2026-09-01T00:00:00.000Z"),
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("past_event");
  });

  it("rejects a start more than 45 days out", () => {
    const result = evaluateDiscoveryHorizon(
      new Date("2026-11-20T00:00:00.000Z"),
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("beyond_horizon");
  });

  it("allows a start a few hours ago", () => {
    expect(
      evaluateDiscoveryHorizon(new Date("2026-09-11T01:00:00.000Z"), now),
    ).toEqual({ ok: true });
  });
});
