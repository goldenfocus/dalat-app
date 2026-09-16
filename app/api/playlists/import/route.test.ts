import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, allowed: true, targetOwner: "owner", role: "user", calls: [] as unknown[], filters: [] as unknown[], rpcError: null as { code: string; message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return name === "can_manage_event_playlist" ? { data: state.allowed } : { data: { playlistId: "copy", count: 2, skipped: 1 }, error: state.rpcError }; },
  from: (table: string) => {
    const q = {
      select: () => q, eq: (key: string, value: unknown) => { state.filters.push({ key, value }); return q; }, lt: () => q, neq: () => q,
      single: async () => ({ data: table === "events" ? { created_by: state.targetOwner } : { role: state.role } }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return q;
  },
}) }));
import { GET, POST } from "./route";
const eventId = "11111111-1111-4111-8111-111111111111";
const sourcePlaylistId = "22222222-2222-4222-8222-222222222222";
const firstId = "33333333-3333-4333-8333-333333333333";
const request = (trackIds: string[] | null = null) => new NextRequest("http://localhost/api/playlists/import", { method: "POST", body: JSON.stringify({ eventId, sourcePlaylistId, trackIds }) });
const get = (target = true) => new NextRequest(`http://localhost/api/playlists/import${target ? `?eventId=${eventId}` : ""}`);
beforeEach(() => { state.user = { id: "owner" }; state.allowed = true; state.targetOwner = "owner"; state.role = "user"; state.calls = []; state.filters = []; state.rpcError = null; });
describe("playlist import authorization and selection", () => {
  it("requires login for listing and importing", async () => { state.user = null; expect((await POST(request())).status).toBe(401); expect((await GET(get())).status).toBe(401); expect(state.calls).toHaveLength(0); });
  it("keeps new-event sources scoped to the current account", async () => { expect((await GET(get(false))).status).toBe(200); expect(state.filters).toContainEqual({ key: "events.created_by", value: "owner" }); });
  it("lists the effective owner’s music in God mode on a past target", async () => { expect((await GET(get())).status).toBe(200); expect(state.filters).toContainEqual({ key: "events.created_by", value: "owner" }); });
  it("allows verified admins to list only the target host’s music", async () => { state.targetOwner = "host"; state.role = "admin"; expect((await GET(get())).status).toBe(200); expect(state.filters).toContainEqual({ key: "events.created_by", value: "host" }); });
  it("denies nonadmins looking up another host, even with a positive legacy playlist permission", async () => { state.targetOwner = "other"; expect((await GET(get())).status).toBe(403); expect(state.filters).not.toContainEqual({ key: "events.created_by", value: "other" }); });
  it("denies unmanageable targets before listing sources", async () => { state.allowed = false; expect((await GET(get())).status).toBe(403); });
  it("passes full and selected imports through the atomic authorized transaction", async () => { expect((await POST(request())).status).toBe(200); expect(state.calls).toContainEqual({ name: "import_event_playlist", args: { p_event_id: eventId, p_source_playlist_id: sourcePlaylistId, p_track_ids: null } }); await POST(request([firstId])); expect(state.calls).toContainEqual({ name: "import_event_playlist", args: { p_event_id: eventId, p_source_playlist_id: sourcePlaylistId, p_track_ids: [firstId] } }); });
  it("returns added and skipped counts without exposing cached personalized data", async () => { const response = await POST(request()); expect(await response.json()).toEqual({ playlistId: "copy", count: 2, skipped: 1 }); expect(response.headers.get("Cache-Control")).toContain("no-store"); });
  it("preserves transaction authorization failures", async () => { state.rpcError = { code: "42501", message: "Forbidden" }; expect((await POST(request())).status).toBe(403); });
  it("rejects empty selection before calling the transaction", async () => { expect((await POST(request([]))).status).toBe(400); expect(state.calls).toHaveLength(0); });
});
