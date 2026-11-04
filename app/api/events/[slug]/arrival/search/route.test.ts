import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mocks.context, tokenHash: (value: string) => `hashed:${value}` }));
import { POST } from "./route";
const context = { params: Promise.resolve({ slug: "exchange" }) };
const request = (body: unknown = { query: "mai@example.test" }, origin = "https://dalat.app") => new NextRequest("https://dalat.app/api/events/exchange/arrival/search", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
 vi.clearAllMocks();
 mocks.context.mockResolvedValue({ admin: { rpc: mocks.rpc, from: mocks.from }, user: { id: "staff" }, event: { id: "event" }, access: { canWelcome: true } });
 mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "arrival_rate_limit" ? true : [], error: null }));
});
describe("private host account search", () => {
 it("uses session authority and a private POST, never returning an email", async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(await response.json()).toEqual({ accounts: [] });
  expect(mocks.rpc).toHaveBeenCalledWith("arrival_search_accounts", { p_event_id: "event", p_actor_id: "staff", p_query: "mai@example.test" });
 });
 it("rejects requests from another origin", async () => {
  expect((await POST(request(undefined, "https://other.test"), context)).status).toBe(403);
  expect(mocks.context).not.toHaveBeenCalled();
 });
 it("rejects forged actor fields and short searches", async () => {
  expect((await POST(request({ query: "mai", actorId: "admin" }), context)).status).toBe(400);
  expect((await POST(request({ query: "a" }), context)).status).toBe(400);
  expect(mocks.context).not.toHaveBeenCalled();
 });
 it("requires a login and welcome authority before searching", async () => {
  mocks.context.mockResolvedValueOnce({ user: null, access: {}, event: {} });
  expect((await POST(request(), context)).status).toBe(401);
  mocks.context.mockResolvedValueOnce({ user: { id: "guest" }, access: { canWelcome: false }, event: {} });
  expect((await POST(request(), context)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("stops when the per-host limit is exhausted", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect((await POST(request(), context)).status).toBe(429);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
});
