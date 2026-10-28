import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), access: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./access", () => ({ venueEditor: mocks.access }));
import { venueEventEditor } from "./event-editor";
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.single };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  mocks.client.mockResolvedValue({ from: () => query });
  mocks.access.mockResolvedValue({ user: { id: "owner" } });
  mocks.single.mockResolvedValue({ data: { venue_id: "venue", status: "published", tribe_id: null }, error: null });
});
it("checks venue editing permission rather than staff arrival permission", async () => {
  expect(await venueEventEditor("exchange")).not.toBeNull();
  expect(mocks.access).toHaveBeenCalledWith("venue");
  mocks.access.mockResolvedValue(null);
  expect(await venueEventEditor("exchange")).toBeNull();
});
it("does not expose private community events or unpublished drafts", async () => {
  for (const data of [{ venue_id: "venue", status: "draft" }, { venue_id: "venue", status: "published", tribe_id: "private", tribe_visibility: "members_only" }, { venue_id: null, status: "published" }]) {
    mocks.single.mockResolvedValue({ data, error: null });
    expect(await venueEventEditor("exchange")).toBeNull();
  }
  expect(mocks.access).not.toHaveBeenCalled();
});
