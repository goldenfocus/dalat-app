// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.role ? { role: state.role } : null,
          }),
        }),
      }),
    }),
    rpc: state.rpc,
  }),
}));
import { GET, POST } from "./route";
const req = (body: unknown, origin = "https://phuong.dalat.app") =>
  new Request("https://phuong.dalat.app/api/phuong-plan", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  state.user = null;
  state.role = null;
  state.rpc.mockReset();
});
describe("private planner endpoint", () => {
  it("requires login for reads and writes and disables caching", async () => {
    for (const res of [await GET(), await POST(req({}))]) {
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toContain("private, no-store");
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("denies nonparticipants", async () => {
    state.user = { id: "outsider" };
    expect((await GET()).status).toBe(403);
    expect((await POST(req({}))).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin submissions", async () => {
    expect((await POST(req({}, "https://elsewhere.example"))).status).toBe(403);
  });
  it("does not let the reviewer overwrite Phuong’s plan", async () => {
    state.user = { id: "zan" };
    state.role = "zan";
    expect(
      (
        await POST(
          req({
            requestId: "11111111-1111-4111-8111-111111111111",
            expectedVersion: 0,
            action: "baseline",
            plan: {},
          }),
        )
      ).status,
    ).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects blank messages before any write or notification", async () => {
    state.user = { id: "phuong" };
    state.role = "phuong";
    expect(
      (
        await POST(
          req({
            requestId: "11111111-1111-4111-8111-111111111111",
            action: "message",
            message: "   ",
          }),
        )
      ).status,
    ).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
