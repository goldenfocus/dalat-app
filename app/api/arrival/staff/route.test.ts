import { beforeEach, expect, it, vi } from "vitest";
const { events } = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock("@/lib/arrival/staff-events", () => ({ staffEvents: events }));
import { GET } from "./route";
beforeEach(() => vi.clearAllMocks());
it("keeps the authenticated event list out of shared caches", async () => {
  events.mockResolvedValue([]);
  const result = await GET();
  expect(result.headers.get("cache-control")).toContain("private, no-store");
  expect(result.headers.get("vary")).toBe("Cookie");
  expect(await result.json()).toEqual({ events: [] });
});
it("returns a private authentication failure without event data", async () => {
  events.mockRejectedValue(new Error("not_authenticated"));
  const result = await GET();
  expect(result.status).toBe(401);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toEqual({ code: "not_authenticated", error: "not_authenticated" });
});
