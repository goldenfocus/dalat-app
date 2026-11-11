import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.fn(),
  getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
import { GET, POST } from "./route";
const post = (body: unknown, origin = "https://dalat.app") =>
  new Request("https://dalat.app/api/dating", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  getUser
    .mockReset()
    .mockResolvedValue({
      data: { user: { id: "79000000-0000-4000-8000-000000000001" } },
      error: null,
    });
});
describe("private dating API", () => {
  it("requires an authenticated session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(
      (await GET(new Request("https://dalat.app/api/dating"))).status,
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects foreign-origin writes", async () => {
    expect(
      (await POST(post({ operation: "pause" }, "https://evil.invalid"))).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects forged user IDs and oversized messages", async () => {
    expect(
      (await POST(post({ operation: "pause", user_id: "someone-else" })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({
            operation: "message",
            target: "79000000-0000-4000-8000-000000000002",
            body: "x".repeat(2001),
          }),
        )
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("routes likes through the authorized RPC without accepting a caller ID", async () => {
    const r = await POST(
      post({
        operation: "action",
        target: "79000000-0000-4000-8000-000000000002",
        action: "like",
        hide_activity: false,
      }),
    );
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("dating_act", {
      p_target: "79000000-0000-4000-8000-000000000002",
      p_action: "like",
      p_hide_activity: false,
    });
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("maps rate limits and unavailable contacts without leaking database errors", async () => {
    rpc.mockResolvedValue({ error: { message: "rate_limited" } });
    expect((await POST(post({ operation: "pause" }))).status).toBe(429);
    rpc.mockResolvedValue({ error: { message: "database details" } });
    const r = await POST(post({ operation: "pause" }));
    expect(await r.json()).toEqual({ code: "invalid_request" });
  });
  it("validates pagination and message targets", async () => {
    expect(
      (await GET(new Request("https://dalat.app/api/dating?after=bad"))).status,
    ).toBe(400);
    expect(
      (await GET(new Request("https://dalat.app/api/dating?target=bad")))
        .status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
