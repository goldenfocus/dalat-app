// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as { id: string } | null, upsert: vi.fn(), select: vi.fn(), eq: vi.fn(), read: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) }, from: state.from }) }));
import { GET, PUT } from "./route";
const preferences = { speaks: [{ language: "en", level: "native" }], learning: { language: "vi", level: "new" } };
function request(body: unknown = preferences, origin = "https://dalat.app") {
  return new Request("https://dalat.app/api/arrival/languages", { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: "self" };
  state.from.mockReturnValue({ select: state.select, upsert: state.upsert });
  state.select.mockReturnValue({ eq: state.eq }); state.eq.mockReturnValue({ maybeSingle: state.read });
  state.read.mockResolvedValue({ data: { preferences }, error: null }); state.upsert.mockResolvedValue({ error: null });
});
it("reads only the current user's preferences with private no-store responses", async () => {
  const response = await GET();
  expect(await response.json()).toEqual({ preferences });
  expect(state.from).toHaveBeenCalledWith("event_language_profiles");
  expect(state.select).toHaveBeenCalledWith("preferences");
  expect(state.eq).toHaveBeenCalledWith("user_id", "self");
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});
it("returns no saved preferences on first use", async () => {
  state.read.mockResolvedValue({ data: null, error: null });
  expect(await (await GET()).json()).toEqual({ preferences: null });
});
it("rejects anonymous access, cross-origin writes, and a caller-supplied user ID", async () => {
  state.user = null;
  expect((await GET()).status).toBe(401); expect((await PUT(request())).status).toBe(401);
  state.user = { id: "self" };
  expect((await PUT(request(preferences, "https://other.example"))).status).toBe(403);
  expect((await PUT(request({ ...preferences, user_id: "victim" }))).status).toBe(400);
  expect(state.upsert).not.toHaveBeenCalled();
});
it("writes the signed-in user's normalized preferences only", async () => {
  const response = await PUT(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ preferences });
  expect(state.upsert).toHaveBeenCalledWith({ user_id: "self", preferences }, { onConflict: "user_id" });
  expect(response.headers.get("cache-control")).toContain("private, no-store");
});
it("does not report success when persistence fails", async () => {
  state.upsert.mockResolvedValue({ error: { message: "database unavailable" } });
  expect((await PUT(request())).status).toBe(503);
});
