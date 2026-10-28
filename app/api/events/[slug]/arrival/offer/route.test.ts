// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mock.context }));
import { PUT } from "./route";
const params = { params: Promise.resolve({ slug: "language-exchange" }) };
const request = (body: unknown, origin = "https://dalat.app") => new Request("https://dalat.app/api/events/language-exchange/arrival/offer", { method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }) as NextRequest;
beforeEach(() => {
  vi.clearAllMocks();
  mock.context.mockResolvedValue({ user: { id: "manager" }, event: { id: "event" }, access: { canManage: true }, admin: { rpc: mock.rpc } });
  mock.rpc.mockResolvedValue({ error: null });
});
it("changes only the verified event's limit using the signed-in manager", async () => {
  expect((await PUT(request({ limit: 10 }), params)).status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("set_event_drink_limit", { p_event_id: "event", p_actor_id: "manager", p_limit: 10 });
});
it("rejects guest staff, cross-origin changes and client identity fields", async () => {
  expect((await PUT(request({ limit: 100 }, "https://other.example"), params)).status).toBe(403);
  expect((await PUT(request({ limit: -1 }), params)).status).toBe(400);
  expect((await PUT(request({ limit: 1.5 }), params)).status).toBe(400);
  expect((await PUT(request({ limit: 100, userId: "manager" }), params)).status).toBe(400);
  mock.context.mockResolvedValue({ user: { id: "staff" }, access: { canManage: false } });
  expect((await PUT(request({ limit: 100 }), params)).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
