import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), select: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { PreorderList } from "./preorder-list";
beforeEach(() => {
  const query = { select: mocks.select, eq: vi.fn(), gte: vi.fn(), order: mocks.order };
  mocks.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.gte.mockReturnValue(query);
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.client.mockResolvedValue({ from: () => query });
});
it("joins the guest profile explicitly when staff and settlement profiles also exist", async () => {
  await PreorderList({ venueId: "social-house", locale: "en" });
  expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("profiles!event_preorders_user_id_fkey(display_name,username)"));
});
