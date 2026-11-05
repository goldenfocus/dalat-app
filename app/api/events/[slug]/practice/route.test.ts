import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), recover: vi.fn() }));
vi.mock("@/lib/practice/server", () => ({ readPractice: mocks.read, mutatePractice: mocks.mutate, recoverPractice: mocks.recover }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ slug: "language-exchange-social-house-z8oc-20261028" }) };
function request(body: unknown, origin = "https://dalat.app") {
  return new Request("https://dalat.app/api/events/test/practice", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => vi.resetAllMocks());
describe("event practice API", () => {
  it("accepts explicit host presence answers but rejects pending, missing IDs and cross-site changes", async () => {
    const answer = { action: "presence", participantId: "player-a", status: "absent", expectedRevision: 0 };
    mocks.mutate.mockResolvedValue({ revision: 1 });
    expect((await POST(request(answer), context)).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith("language-exchange-social-house-z8oc-20261028", answer);
    expect((await POST(request({ ...answer, status: "pending" }), context)).status).toBe(400);
    expect((await POST(request({ ...answer, participantId: "" }), context)).status).toBe(400);
    expect((await POST(request(answer, "https://other.example"), context)).status).toBe(403);
  });
  it("rejects cross-site starts, invalid durations and the old direct-start bypass", async () => {
    expect((await POST(request({ action: "draft", minutes: 12, expectedRevision: 0 }, "https://other.example"), context)).status).toBe(403);
    expect((await POST(request({ action: "draft", minutes: 0, expectedRevision: 0 }), context)).status).toBe(400);
    expect((await POST(request({ minutes: 10, expectedRound: 0 }), context)).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("preserves staff authorization and concurrent revision conflicts", async () => {
    mocks.mutate.mockRejectedValueOnce(new Error("forbidden")).mockRejectedValueOnce(new Error("status_conflict"));
    expect((await POST(request({ action: "draft", minutes: 12, expectedRevision: 0 }), context)).status).toBe(403);
    expect((await POST(request({ action: "draft", minutes: 12, expectedRevision: 0 }), context)).status).toBe(409);
  });
  it("never caches participant responses", async () => {
    mocks.read.mockResolvedValue({ canStart: false, groups: [] });
    const response = await GET(new Request("https://dalat.app/api/events/test/practice"), context);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it("restores a receipt with a private cookie without starting another round", async () => {
    mocks.recover.mockResolvedValue({ view: { canStart: false, me: { name: "Guest" }, groups: [] }, cookie: "dalat_practice_event", token: "signed-test-token" });
    const response = await POST(request({ action: "find", code: "12ABCDEF" }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("accepts one own participation change without a second arrival", async () => {
    mocks.mutate.mockResolvedValue({ revision: 1, participation: "visiting" });
    expect((await POST(request({ action: "participation", expectedRevision: -1, status: "visiting" }), context)).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith("language-exchange-social-house-z8oc-20261028", { action: "participation", expectedRevision: -1, status: "visiting" });
  });
  it("requires a reviewed draft UUID and revision to start", async () => {
    expect((await POST(request({ action: "start", expectedRevision: 1 }), context)).status).toBe(400);
    expect((await POST(request({ action: "start", draftId: "not-a-draft", expectedRevision: 1 }), context)).status).toBe(400);
    mocks.mutate.mockResolvedValue({ revision: 2 });
    expect((await POST(request({ action: "start", draftId: "00000000-0000-4000-8000-000000000001", expectedRevision: 1 }), context)).status).toBe(200);
  });
  it("rejects duplicate physical tables and unbounded extensions", async () => {
    const table = { number: 1, floor: "downstairs", capacity: 4, available: true };
    expect((await POST(request({ action: "settings", expectedRevision: 0, floorPolicy: "balanced", tables: [table, table] }), context)).status).toBe(400);
    expect((await POST(request({ action: "extend", expectedRevision: 0, seconds: 99999 }), context)).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

it("uses twenty-minute defaults and accepts only a bounded host draft-swap payload", async () => {
  mocks.mutate.mockResolvedValue({ revision: 1 });
  expect((await POST(request({ action: "draft", expectedRevision: 0 }), context)).status).toBe(200);
  expect(mocks.mutate).toHaveBeenLastCalledWith("language-exchange-social-house-z8oc-20261028", { action: "draft", expectedRevision: 0, minutes: 20 });
  const swap = { action: "swap", expectedRevision: 1, draftId: "00000000-0000-4000-8000-000000000001", participantId: "player-a", withParticipantId: "player-b" };
  expect((await POST(request(swap), context)).status).toBe(200);
  expect(mocks.mutate).toHaveBeenLastCalledWith("language-exchange-social-house-z8oc-20261028", swap);
  expect((await POST(request({ ...swap, withParticipantId: "" }), context)).status).toBe(400);
  expect((await POST(request({ ...swap, groups: [] }), context)).status).toBe(400);
});
