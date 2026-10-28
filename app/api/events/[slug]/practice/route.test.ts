import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/practice/server", () => ({ readPractice: mocks.read, startPractice: mocks.start }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ slug: "language-exchange-social-house-z8oc-20261028" }) };
function request(body: unknown, origin = "https://dalat.app") {
  return new Request("https://dalat.app/api/events/test/practice", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => vi.resetAllMocks());
describe("event practice API", () => {
  it("rejects cross-site starts and invalid duration without a write", async () => {
    expect((await POST(request({ minutes: 10, expectedRound: 0 }, "https://other.example"), context)).status).toBe(403);
    expect((await POST(request({ minutes: 0, expectedRound: 0 }), context)).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("preserves staff authorization and concurrent-round conflicts", async () => {
    mocks.start.mockRejectedValueOnce(new Error("forbidden")).mockRejectedValueOnce(new Error("status_conflict"));
    expect((await POST(request({ minutes: 10, expectedRound: 0 }), context)).status).toBe(403);
    expect((await POST(request({ minutes: 10, expectedRound: 0 }), context)).status).toBe(409);
  });
  it("never caches participant responses", async () => {
    mocks.read.mockResolvedValue({ canStart: false, groups: [] });
    const response = await GET(new Request("https://dalat.app/api/events/test/practice"), context);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
