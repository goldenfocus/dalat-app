import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET, POST } from "./route";

const id = "8b37c6ec-0758-4e6a-9d10-c41622c4394e";
const session = "becbc992-6c78-4598-9df8-907715263ea7";
const url = "https://example.test/api/rentals/stats/" + id;
const context = () => ({ params: Promise.resolve({ id }) });
const post = (origin: string, media: string | null = null) => new Request(url, {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({ session, media }),
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://stats-db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  rpc.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("rental stats endpoint", () => {
  it("rejects cross-origin recording before accessing analytics", async () => {
    expect((await POST(post("https://unrelated.test"), context())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends pseudonymous keys to the database and returns aggregate counts only", async () => {
    const counts = { views: 8, mediaClicks: 12, requests: 2, watching: 1 };
    rpc.mockResolvedValue({ data: { ...counts, secret: session }, error: null });
    const response = await POST(post("https://example.test"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual(counts);
    expect(rpc).toHaveBeenCalledWith("rental_stats_record", {
      listing: id,
      visitor: expect.stringMatching(/^[0-9a-f]{64}$/),
      rate_bucket: expect.stringMatching(/^[0-9a-f]{64}$/),
      media_src: null,
    });
    expect(rpc.mock.calls[0][1].visitor).not.toContain(session);
  });

  it("maps a successful media open and a limited request to distinct statuses", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({ data: { limited: true }, error: null });
    expect((await POST(post("https://example.test", "/rentals/photo.webp"), context())).status).toBe(204);
    expect((await POST(post("https://example.test"), context())).status).toBe(429);
  });

  it("returns not found for a listing whose aggregate is not public", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await GET(new Request(url), context())).status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("rental_stats_visible", { listing: id });
  });
});
