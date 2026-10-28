// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: state.context, mapOrder: (row: Record<string, unknown>) => ({ ...row, items: row.event_preorder_items, ready_for_preparation: !row.is_reservation || !!row.participant_id }) }));
import { POST } from "./route";
const route = { params: Promise.resolve({ slug: "exchange" }) };
const payload = { requestId: "11000000-0000-4000-8000-000000000001", items: [{ item_id: "12000000-0000-4000-8000-000000000001", qty: 1 }], sponsoredItemId: "12000000-0000-4000-8000-000000000001" };
const request = (body: unknown = payload, origin = "https://dalat.app") => new Request("https://dalat.app/api/events/exchange/arrival/reserve?actor=someone-else", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }) as NextRequest;
beforeEach(() => {
  vi.clearAllMocks();
  state.context.mockResolvedValue({ admin: { rpc: state.rpc }, user: { id: "session-user" }, event: { id: "actual-event" } });
  state.rpc.mockResolvedValue({ data: { order: { id: "order", is_reservation: true, participant_id: null, items: [] } }, error: null });
});
describe("private drink reservation API", () => {
  it("uses verified actor and event IDs only, retaining private noncacheable responses", async () => {
    const response = await POST(request(), route);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(state.rpc).toHaveBeenCalledWith("arrival_reserve", { p_actor_id: "session-user", p_event_id: "actual-event", p_request_id: payload.requestId, p_payload: { ...payload, note: "" } });
    expect((await response.json()).order.ready_for_preparation).toBe(false);
  });
  it("rejects anonymous, cross-origin and identity/price-spoofing requests", async () => {
    state.context.mockResolvedValue({ user: null });
    expect((await POST(request(), route)).status).toBe(401);
    expect((await POST(request(payload, "https://attacker.example"), route)).status).toBe(403);
    expect((await POST(request({ ...payload, userId: "target" }), route)).status).toBe(400);
    expect((await POST(request({ ...payload, sponsored_vnd: 1 }), route)).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not turn rejected or duplicate sponsorship into a success", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "sponsor_already_used" } });
    const response = await POST(request(), route);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "sponsor_already_used", error: "sponsor_already_used" });
  });
});
