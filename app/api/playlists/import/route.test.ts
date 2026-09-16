import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, allowed: true, source: {} as unknown, inserts: [] as unknown[], trackError: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  rpc: async () => ({ data: state.allowed }),
  from: (table: string) => {
    const q = {
      select: () => q, eq: () => q, lt: () => q, delete: () => q,
      insert: (value: unknown) => { state.inserts.push(value); return table === "playlist_tracks" ? Promise.resolve({ error: state.trackError }) : { select: () => ({ single: async () => ({ data: { id: "copy" }, error: null }) }) }; },
      single: async () => ({ data: state.source, error: state.source ? null : new Error("Missing") }),
    };
    return q;
  },
}) }));
import { POST } from "./route";
const eventId = "11111111-1111-4111-8111-111111111111";
const sourcePlaylistId = "22222222-2222-4222-8222-222222222222";
const firstId = "33333333-3333-4333-8333-333333333333";
const secondId = "44444444-4444-4444-8444-444444444444";
const request = (trackIds: string[] | null = null) => new NextRequest("http://localhost/api/playlists/import", { method: "POST", body: JSON.stringify({ eventId, sourcePlaylistId, trackIds }) });
beforeEach(() => { state.user = { id: "owner" }; state.allowed = true; state.inserts = []; state.trackError = null; state.source = { title: "Playlist", description: null, playlist_tracks: [{ id: secondId, title: "B", file_url: "b.mp3", sort_order: 4 }, { id: firstId, title: "A", file_url: "a.mp3", sort_order: 1 }] }; });
describe("playlist import authorization and selection", () => {
  it("requires login", async () => { state.user = null; expect((await POST(request())).status).toBe(401); expect(state.inserts).toHaveLength(0); });
  it("rejects targets the caller cannot manage", async () => { state.allowed = false; expect((await POST(request())).status).toBe(403); expect(state.inserts).toHaveLength(0); });
  it("rejects unavailable source playlists and tracks", async () => { expect((await POST(request([eventId]))).status).toBe(409); state.source = null; expect((await POST(request())).status).toBe(404); expect(state.inserts).toHaveLength(0); });
  it("imports the full playlist in original order with fresh identities", async () => { expect((await POST(request())).status).toBe(200); expect(state.inserts[1]).toEqual([{ playlist_id: "copy", title: "A", file_url: "a.mp3", sort_order: 0 }, { playlist_id: "copy", title: "B", file_url: "b.mp3", sort_order: 1 }]); });
  it("imports only chosen MP3s", async () => { expect((await POST(request([secondId]))).status).toBe(200); expect(state.inserts[1]).toEqual([{ playlist_id: "copy", title: "B", file_url: "b.mp3", sort_order: 0 }]); });
  it("rejects empty selection before writing", async () => { expect((await POST(request([]))).status).toBe(400); expect(state.inserts).toHaveLength(0); });
  it("reports failed bulk imports", async () => { state.trackError = new Error("storage"); expect((await POST(request())).status).toBe(500); });
});
