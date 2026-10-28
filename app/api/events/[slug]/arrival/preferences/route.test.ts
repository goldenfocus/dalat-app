import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({ context: vi.fn(), preferences: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mocks.context }));
vi.mock("@/lib/arrival/preferences", () => ({ getLanguagePreferences: mocks.preferences }));
const params = { params: Promise.resolve({ slug: "social-house" }) };
const preferences = { practiceLanguage: "vietnamese", englishLevel: "native", vietnameseLevel: "starting" };
const request = (body: unknown, origin = "https://dalat.app") => new NextRequest("https://dalat.app/api/events/social-house/arrival/preferences", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: "signed-in-user" }, admin: { from: () => ({ upsert: mocks.upsert }) } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.preferences.mockResolvedValue(preferences);
});
describe("private RSVP language preferences", () => {
  it("reads only the signed-in account", async () => {
    const result = await GET(new NextRequest("https://dalat.app/api/events/social-house/arrival/preferences"), params);
    expect(await result.json()).toEqual({ preferences });
    expect(mocks.preferences).toHaveBeenCalledWith("signed-in-user");
    expect(result.headers.get("cache-control")).toContain("private");
  });
  it("rejects anonymous and cross-origin writes", async () => {
    expect((await POST(request(preferences, "https://other.example"), params)).status).toBe(403);
    mocks.context.mockResolvedValue({ user: null });
    expect((await POST(request(preferences), params)).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("refuses account impersonation and unknown levels", async () => {
    expect((await POST(request({ ...preferences, user_id: "another-user" }), params)).status).toBe(400);
    expect((await POST(request({ ...preferences, englishLevel: "expert-ish" }), params)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("persists all six-level choices for the authenticated account", async () => {
    expect((await POST(request(preferences), params)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "signed-in-user", practice_language: "vietnamese", english_level: "native", vietnamese_level: "starting" }));
  });
});
