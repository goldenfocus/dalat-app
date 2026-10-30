import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ client: vi.fn(), select: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/timezone", () => ({ formatInDaLatAsync: async () => "Nov 4" }));
vi.mock("./preorder-status-buttons", () => ({ PreorderStatusButtons: ({ id, readyForPreparation }: { id: string; readyForPreparation: boolean }) => <span data-order={id} data-ready={readyForPreparation} /> }));
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

it("keeps unarrived reservations and already served drinks out of the prep list", async () => {
  const base = { total_vnd: 50000, note: null, phone: null, created_at: "2026-11-04", profiles: null,
    events: { slug: "exchange", title: "Exchange", starts_at: "2026-11-04" } };
  mocks.order.mockResolvedValue({ error: null, data: [
    { ...base, id: "waiting", status: "pending", is_reservation: true, participant_id: null, sponsor_status: "reserved", event_preorder_items: [{ name_snapshot: "Waiting tea", qty: 1 }] },
    { ...base, id: "ready", status: "confirmed", is_reservation: true, participant_id: "guest", sponsor_status: "owed", event_preorder_items: [{ name_snapshot: "Ready coffee", qty: 2 }] },
    { ...base, id: "done", status: "fulfilled", is_reservation: false, participant_id: "guest2", sponsor_status: "none", event_preorder_items: [{ name_snapshot: "Served juice", qty: 3 }] },
  ] });
  const html = renderToStaticMarkup(await PreorderList({ venueId: "social-house", locale: "en" }));
  const prepHeader = new DOMParser().parseFromString(html, "text/html").querySelector(".border-b")?.textContent;
  expect(prepHeader).toContain("2× Ready coffee");
  expect(prepHeader).not.toContain("Waiting tea");
  expect(prepHeader).not.toContain("Served juice");
  expect(html).toContain('data-order="waiting" data-ready="false"');
  expect(html).toContain('data-order="ready" data-ready="true"');
});
