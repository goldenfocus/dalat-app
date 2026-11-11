import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), qr: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mocks.context }));
vi.mock("@/lib/arrival/door", () => ({ doorKey: (eventId: string) => `key-${eventId}` }));
vi.mock("qrcode", () => ({ default: { toString: mocks.qr } }));
import { GET } from "./route";

const context = { params: Promise.resolve({ slug: "exchange" }) };
const get = (query: string) => GET(new NextRequest(`https://dalat.app/api/events/exchange/arrival/qr${query}`), context);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.qr.mockResolvedValue("<svg/>");
  mocks.context.mockResolvedValue({ user: { id: "host" }, event: { id: "event" }, access: { canWelcome: true } });
});

describe("arrival QR", () => {
  it("keeps the public guest QR free of the door key and cacheable", async () => {
    const response = await get("?locale=vi");
    expect(response.status).toBe(200);
    expect(mocks.qr.mock.calls[0][0]).toBe("https://dalat.app/vi/events/exchange/arrive");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("adds the door key only for welcome staff and never caches it", async () => {
    const response = await get("?locale=en&door=1");
    expect(response.status).toBe(200);
    expect(mocks.qr.mock.calls[0][0]).toBe("https://dalat.app/events/exchange/arrive?door=key-event");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it("refuses the door QR to guests, non-welcome staff and unknown events", async () => {
    mocks.context.mockResolvedValue({ user: null, event: { id: "event" }, access: { canWelcome: false } });
    expect((await get("?door=1")).status).toBe(403);
    mocks.context.mockResolvedValue({ user: { id: "orders" }, event: { id: "event" }, access: { canWelcome: false, canOrder: true } });
    const denied = await get("?door=1");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("cache-control")).toContain("no-store");
    mocks.context.mockRejectedValue(new Error("event_not_found"));
    expect((await get("?door=1")).status).toBe(404);
    expect(mocks.qr).not.toHaveBeenCalled();
  });
  it("still rejects invalid slugs and locales", async () => {
    expect((await get("?locale=xx")).status).toBe(400);
    expect((await GET(new NextRequest("https://dalat.app/api/events/BAD/arrival/qr"), { params: Promise.resolve({ slug: "BAD_slug" }) })).status).toBe(400);
  });
});
