import { beforeEach, expect, it, vi } from "vitest";
import { getDrinkSelection } from "./drink-selection";

const { client, query } = vi.hoisted(() => ({ client: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["select", "eq", "in", "order", "limit"] as const) query[key].mockReturnValue(query);
  client.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});

it("reads only the signed-in attendee's non-cancelled orders for this event", async () => {
  const items = [{ name_snapshot: "Cà phê sữa", qty: 1 }];
  query.maybeSingle.mockResolvedValue({ data: { event_preorder_items: items }, error: null });
  expect(await getDrinkSelection("event", "viewer")).toEqual({ items });
  expect(query.eq.mock.calls).toEqual([["event_id", "event"], ["user_id", "viewer"]]);
  expect(query.in).toHaveBeenCalledWith("status", ["pending", "confirmed", "fulfilled"]);
  expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  expect(query.limit).toHaveBeenCalledWith(1);
});

it("distinguishes no active order from a failed lookup", async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  expect(await getDrinkSelection("event", "viewer")).toBeNull();
  query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
  expect(await getDrinkSelection("event", "viewer")).toBeUndefined();
});

it("does not query private orders without a signed-in attendee", async () => {
  expect(await getDrinkSelection("event", null)).toBeNull();
  expect(client).not.toHaveBeenCalled();
});
