import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
  default: { lookup: lookupMock },
}));

import {
  fetchEventSourcePreview,
  isPublicNetworkAddress,
  normalizeSuggestionUrl,
} from "./event-suggestion";

describe("event suggestion URL safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "169.254.169.254",
    "172.18.0.2",
    "192.168.1.2",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("rejects private or reserved address %s", (address) => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicNetworkAddress(address)).toBe(true);
    }
  );

  it("normalizes tracking variants into one queue identity", () => {
    expect(
      normalizeSuggestionUrl(
        "https://Example.com/events/flowers/?utm_source=ig&b=2&a=1#tickets"
      )
    ).toBe("https://example.com/events/flowers?a=1&b=2");
  });

  it.each([
    "https://attacker.example/event",
    "https://evilfacebook.com/events/1",
  ])("rejects unreviewed domain %s before making a request", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEventSourcePreview(url)).rejects.toHaveProperty(
      "code",
      "unsupported_source"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchEventSourcePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("extracts bounded, reviewable source data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          `<!doctype html><html><head>
            <meta property="og:title" content="Đà Lạt Flower Night">
            <meta property="og:image" content="/poster.jpg">
          </head><body><main>
            Đà Lạt Flower Night happens on 26/12/2026 at Lâm Viên Square.
            Join the community for flowers, music, and a warm evening together.
          </main></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        )
      )
    );

    const preview = await fetchEventSourcePreview("https://www.eventbrite.com/e/flower-night");

    expect(preview.title).toBe("Đà Lạt Flower Night");
    expect(preview.content).toContain("26/12/2026");
    expect(preview.imageUrls).toEqual([]);
  });

  it("refuses a redirect to a private destination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEventSourcePreview("https://www.eventbrite.com/e/1")).rejects.toHaveProperty(
      "code",
      "unsafe_url"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses hostnames that resolve to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.4", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEventSourcePreview("https://www.eventbrite.com/e/1")).rejects.toHaveProperty(
      "code",
      "unsafe_url"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
