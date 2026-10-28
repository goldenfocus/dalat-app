import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), admin: vi.fn(), rpc: vi.fn(), getUser: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/arrival/server", () => ({ arrivalAdmin: mocks.admin }));
import { GET } from "./route";
const context = { params: Promise.resolve({ slug: "exchange" }) };
const request = new Request("https://dalat.app/api/events/exchange/arrival/access?actor=other-user");

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  query.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: () => query });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "session-user" } } });
  mocks.maybeSingle.mockResolvedValue({ data: { id: "event", tribe_id: null }, error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { canWelcome: true, canOrder: true, canManage: true }, error: null });
});

describe("private staff discovery permissions", () => {
  it("uses only the authenticated identity and disables shared caching", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.rpc).toHaveBeenCalledWith("arrival_access", { p_event_id: "event", p_actor_id: "session-user" });
    expect(mocks.eq).toHaveBeenCalledWith("arrival_enabled", true);
  });
  it("rejects anonymous discovery without querying privileged tables", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request, context)).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not expose private community events", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "event", tribe_id: "private", tribe_visibility: "private" } });
    expect((await GET(request, context)).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("returns denied permissions for a signed-in guest", async () => {
    const denied = { canWelcome: false, canOrder: false, canManage: false };
    mocks.rpc.mockResolvedValue({ data: denied, error: null });
    expect(await (await GET(request, context)).json()).toEqual(denied);
  });
});
