import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: mocks.lookup },
  lookup: mocks.lookup,
}));

import { fetchSourceText, isPublicActivitySourceAddress } from "./fetch";
import type { ActivitySource } from "./types";

const source: ActivitySource = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "official-calendar",
  name: "Official calendar",
  canonical_url: "https://events.example.com",
  discovery_url: "https://events.example.com/calendar",
  page_path_prefix: "/",
  source_kind: "official",
  fetch_mode: "json_ld_sitemap",
  access_basis: "public",
  trust_tier: 1,
  policy_status: "approved",
  crawl_interval_minutes: 60,
  max_items_per_run: 10,
  status: "active",
  auto_publish_enabled: false,
  auto_publish_threshold: 90,
  organizer_id: null,
  venue_id: null,
  metadata: null,
};

describe("Activity Graph source fetching", () => {
  beforeEach(() => {
    mocks.lookup
      .mockReset()
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the timeout active until the bounded response body is read", async () => {
    vi.useFakeTimers();
    const captured: { signal: AbortSignal | null } = { signal: null };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured.signal = init?.signal as AbortSignal;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            captured.signal?.addEventListener("abort", () => {
              controller.error(
                captured.signal?.reason ??
                  new DOMException("Aborted", "AbortError"),
              );
            });
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchSourceText(source, source.discovery_url!, {
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captured.signal).not.toBeNull();
    expect(captured.signal?.aborted).toBe(false);

    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await rejected;
    expect(captured.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "10.1.2.3",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])("rejects private or local resolved address %s", (address) => {
    expect(isPublicActivitySourceAddress(address)).toBe(false);
  });

  it("blocks hostnames that resolve to private targets before fetch", async () => {
    mocks.lookup.mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSourceText(source, source.discovery_url!),
    ).rejects.toThrow("Private activity-source address blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
