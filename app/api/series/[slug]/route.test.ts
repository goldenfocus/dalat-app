import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true, anchor: { starts_at: "2026-12-02T11:00:00Z" } as { starts_at: string } | null, queries: [] as { table: string; update?: Record<string, unknown>; filters: unknown[][] }[] }));
vi.mock("@/lib/events/editor-access", () => ({ canEditSeries: async () => state.allowed }));
vi.mock("@/lib/cache/server-cache", () => ({ CACHE_TAGS: { events: "events" } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "venue-owner" } } }) },
  from: (table: string) => {
    const entry: { table: string; update?: Record<string, unknown>; filters: unknown[][] } = { table, filters: [] }; state.queries.push(entry);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { entry.filters.push(["eq", key, value]); return query; },
      gte: (key: string, value: unknown) => { entry.filters.push(["gte", key, value]); return query; },
      gt: (key: string, value: unknown) => { entry.filters.push(["gt", key, value]); return query; },
      update: (value: Record<string, unknown>) => { entry.update = value; return query; },
      single: async () => ({ data: table === "profiles" ? { role: "user" } : { id: "series", created_by: "original-author", title: "Old title", description: "Description", starts_at_time: "18:00", duration_minutes: 120 }, error: null }),
      maybeSingle: async () => ({ data: state.anchor, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    }; return query;
  },
}) }));
import { PATCH } from "./route";
const context = { params: Promise.resolve({ slug: "exchange" }) };
const request = (scope: string) => new Request("https://dalat.app/api/series/exchange", { method: "PATCH", body: JSON.stringify({ title: "New title", image_url: "https://example.invalid/cover.jpg", image_fit: "contain", price_type: "free", starts_at_time: "19:00", update_scope: scope, from_event_id: "chosen-event" }) });
beforeEach(() => { state.allowed = true; state.anchor = { starts_at: "2026-12-02T11:00:00Z" }; state.queries = []; });
it("lets venue owners update the template and this-and-future dates from the selected occurrence", async () => {
  expect((await PATCH(request("future"), context)).status).toBe(200);
  const edits = state.queries.filter(q => q.update);
  expect(edits.find(q => q.table === "event_series")?.update).toMatchObject({ image_url: "https://example.invalid/cover.jpg", image_fit: "contain", starts_at_time: "19:00" });
  const eventEdit = edits.find(q => q.table === "events");
  expect(eventEdit?.update).toMatchObject({ title: "New title", image_fit: "contain", price_type: "free" });
  expect(eventEdit?.filters).toContainEqual(["gte", "starts_at", state.anchor!.starts_at]);
  expect(state.queries.find(q => q.table === "events" && !q.update)?.filters).toContainEqual(["eq", "series_id", "series"]);
});
it("includes past dates when all events are selected", async () => {
  expect((await PATCH(request("all"), context)).status).toBe(200);
  expect(state.queries.filter(q => q.table === "events").flatMap(q => q.filters).filter(f => f[1] === "starts_at")).toEqual([]);
});
it("rejects unrelated venue editors without changing anything", async () => {
  state.allowed = false;
  expect((await PATCH(request("all"), context)).status).toBe(403);
  expect(state.queries.some(q => q.update)).toBe(false);
});
it("rejects an occurrence outside the selected series", async () => {
  state.anchor = null;
  expect((await PATCH(request("future"), context)).status).toBe(400);
  expect(state.queries.some(q => q.update)).toBe(false);
});
