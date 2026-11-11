import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), guestToken: vi.fn(), ownReceipt: vi.fn(), confirm: vi.fn(), valid: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mocks.context, guestToken: mocks.guestToken, ownReceipt: mocks.ownReceipt, tokenHash: (value: string) => `hash:${value}` }));
vi.mock("@/lib/arrival/door", () => ({ validDoorKey: mocks.valid }));
vi.mock("@/lib/practice/server", () => ({ confirmArrival: mocks.confirm }));
import { POST } from "./route";

const context = { params: Promise.resolve({ slug: "exchange" }) };
function request(body: unknown, origin = "https://dalat.app") {
  return new Request("https://dalat.app/api/events/exchange/arrival/door", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: null, event: { id: "event", isOpen: true } });
  mocks.guestToken.mockResolvedValue("cookie");
  mocks.ownReceipt.mockResolvedValue({ participant: { id: "participant" }, order: null });
  mocks.valid.mockImplementation((eventId: string, key: string) => eventId === "event" && key === "door");
  mocks.confirm.mockResolvedValue(true);
});

describe("door presence confirmation", () => {
  it("confirms only the caller's own existing arrival", async () => {
    const response = await POST(request({ doorKey: "door" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(mocks.ownReceipt).toHaveBeenCalledWith("event", undefined, "hash:cookie");
    expect(mocks.confirm).toHaveBeenCalledWith("exchange", "participant");
  });
  it("resolves a signed-in attendee without a guest cookie", async () => {
    mocks.context.mockResolvedValue({ user: { id: "user" }, event: { id: "event", isOpen: true } });
    mocks.guestToken.mockResolvedValue(null);
    expect((await POST(request({ doorKey: "door" }), context)).status).toBe(200);
    expect(mocks.ownReceipt).toHaveBeenCalledWith("event", "user", null);
  });
  it("rejects cross-origin, malformed and wrong-key requests before touching attendance", async () => {
    expect((await POST(request({ doorKey: "door" }, "https://evil.example"), context)).status).toBe(403);
    expect((await POST(request({}), context)).status).toBe(400);
    expect((await POST(request({ doorKey: "door", participantId: "other" }), context)).status).toBe(400);
    expect((await POST(request({ doorKey: "x".repeat(65) }), context)).status).toBe(400);
    expect((await POST(request({ doorKey: "wrong" }), context)).status).toBe(403);
    expect(mocks.ownReceipt).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("never creates an arrival for someone who has not checked in, or outside the event window", async () => {
    mocks.ownReceipt.mockResolvedValue(null);
    expect((await POST(request({ doorKey: "door" }), context)).status).toBe(404);
    mocks.context.mockResolvedValue({ user: null, event: { id: "event", isOpen: false } });
    expect((await POST(request({ doorKey: "door" }), context)).status).toBe(400);
    mocks.context.mockRejectedValue(new Error("event_not_found"));
    expect((await POST(request({ doorKey: "door" }), context)).status).toBe(404);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
