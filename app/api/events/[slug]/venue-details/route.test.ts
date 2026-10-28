import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ editor: vi.fn(), admin: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/venues/event-editor", () => ({ venueEventEditor: mocks.editor }));
vi.mock("@/lib/experiences/server", () => ({ experienceAdmin: mocks.admin }));
import { PATCH } from "./route";
const event = { id: "event-id", venue_id: "venue-id", title: "Exchange", description: "An original description", starts_at: "2026-10-28T11:00:00.000Z", ends_at: "2026-10-28T13:00:00.000Z", series_id: "series", updated_at: "revision-1" };
const payload = { title: "Language exchange", description: "A language exchange where everyone is welcome to practice English and Vietnamese together.", starts_at: "2026-10-28T12:00:00.000Z", capacity: 30, updated_at: "revision-1" };
const context = { params: Promise.resolve({ slug: "exchange" }) };
const request = (body: unknown = payload, origin = "https://dalat.app") => new Request("https://dalat.app/api/events/exchange/venue-details", { method: "PATCH", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.editor.mockResolvedValue({ event });
  const query = { update: mocks.update, eq: mocks.eq, select: vi.fn(), maybeSingle: mocks.single };
  mocks.update.mockReturnValue(query); mocks.eq.mockReturnValue(query); query.select.mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: () => query });
  mocks.single.mockResolvedValue({ data: { id: event.id }, error: null });
});
describe("venue owner event updates", () => {
  it("saves only allowed fields on the authorized venue event and preserves duration", async () => {
    expect((await PATCH(request(), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ title: payload.title, description: payload.description, starts_at: payload.starts_at, capacity: 30, ends_at: "2026-10-28T14:00:00.000Z", source_locale: null, is_exception: true });
    expect(mocks.eq).toHaveBeenCalledWith("venue_id", event.venue_id);
    expect(mocks.eq).toHaveBeenCalledWith("updated_at", event.updated_at);
  });
  it("leaves an unchanged recurring event untouched when saving", async () => {
    mocks.editor.mockResolvedValue({ event: { ...event, ...payload } });
    expect((await PATCH(request(), context)).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects ordinary staff and unrelated viewers before privileged writes", async () => {
    mocks.editor.mockResolvedValue(null);
    expect((await PATCH(request(), context)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("rejects ownership, publication and venue changes", async () => {
    for (const field of ["created_by", "status", "venue_id", "sponsor_tier"]) {
      expect((await PATCH(request({ ...payload, [field]: "other" }), context)).status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects cross-site writes", async () => {
    expect((await PATCH(request(payload, "https://elsewhere.example"), context)).status).toBe(403);
    expect(mocks.editor).not.toHaveBeenCalled();
  });
  it("does not overwrite a concurrent edit", async () => {
    expect((await PATCH(request({ ...payload, updated_at: "old" }), context)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request(), context)).status).toBe(409);
  });
});
