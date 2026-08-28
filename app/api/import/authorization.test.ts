import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  serviceClient: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/import/moderator-authorization", () => ({
  authorizeImportModerator: mocks.authorize,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.serviceClient,
}));

vi.mock("@/lib/import/processors/facebook", () => ({
  processFacebookEvents: vi.fn(),
}));

vi.mock("@/lib/import/processors/luma", () => ({
  processLumaEvents: vi.fn(),
}));

vi.mock("@/lib/import/processors/flip", () => ({
  fetchFlipEvent: vi.fn(),
  processFlipEvents: vi.fn(),
}));

vi.mock("@/lib/import/processors/dalat-gov", () => ({
  fetchArticle: vi.fn(),
  extractEventsFromArticle: vi.fn(),
}));

import { GET as testApify } from "./test-apify/route";
import { POST as discoverVenues } from "./discover/route";
import { POST as importUrl } from "./url/route";

function jsonRequest(path: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/import/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("privileged import route authorization", () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });
    mocks.serviceClient.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.APIFY_API_TOKEN = "super-secret-apify-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["Apify diagnostics", () => testApify()],
    [
      "venue discovery",
      () => discoverVenues(jsonRequest("discover", { query: "Da Lat" })),
    ],
    [
      "URL import",
      () =>
        importUrl(jsonRequest("url", { url: "https://example.com/events/1" })),
    ],
  ])(
    "blocks unauthenticated %s before secrets or network access",
    async (_name, callRoute) => {
      const response = await callRoute();
      const body = await response.text();

      expect(response.status).toBe(401);
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.serviceClient).not.toHaveBeenCalled();
      expect(body).not.toContain("super-secret-apify-token");
      expect(body).not.toContain("tokenPrefix");
      expect(body).not.toContain("allActors");
      expect(body).not.toContain("relevantActors");
    },
  );

  it.each([
    [
      "venue discovery",
      () => discoverVenues(jsonRequest("discover", { query: "Da Lat" })),
    ],
  ])(
    "fails closed when the %s rate limiter is unavailable",
    async (_name, callRoute) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { message: "database unavailable" },
      }));
      mocks.authorize.mockResolvedValue({
        ok: true,
        user: { id: "moderator-1" },
        supabase: { rpc },
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await callRoute();

      expect(response.status).toBe(503);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects a private URL before fetching or constructing a service client", async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      user: { id: "moderator-1" },
      supabase: {},
    });

    const response = await importUrl(
      jsonRequest("url", {
        url: "http://127.0.0.1/events/private",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});
