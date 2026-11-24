import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

function request(query: string) {
  return new Request("https://dalat.app/api/events/address-assist", {
    method: "POST", body: JSON.stringify({ query }),
  });
}

describe("Golden Focus address assist", () => {
  beforeEach(() => {
    vi.stubEnv("DALAT_ADDRESS_AI_TOKEN", "test-token");
    getUser.mockResolvedValue({ data: { user: { id: "host" } } });
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the query only to the dedicated Mac proxy", async () => {
    const suggestion = "55 Ngo Thi Sy, Da Lat, Lam Dong";
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ query: suggestion }));

    const response = await POST(request("55 Ngo Thi Sy"));
    expect(await response.json()).toEqual({ suggestion });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://dalat-ai.goldenfoc.us/chat",
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("drops a suggestion that changes the street number", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ query: "56 Ngo Thi Sy, Da Lat" }));
    expect(await (await POST(request("55 Ngo Thi Sy"))).json()).toEqual({ suggestion: null });
  });

  it("does not forward requests without a session or quota", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(request("55 Ngo Thi Sy"))).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    expect((await POST(request("55 Ngo Thi Sy"))).status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });
});
