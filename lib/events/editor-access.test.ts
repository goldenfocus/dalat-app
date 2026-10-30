import { expect, it, vi } from "vitest";
import { canEditEvent, canEditSeries } from "./editor-access";
import type { createClient } from "@/lib/supabase/server";
type Client = Awaited<ReturnType<typeof createClient>>;
it("uses session-scoped database authorization, not a caller-provided actor", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const db = { rpc } as unknown as Client;
  expect(await canEditEvent(db, "event")).toBe(true);
  expect(await canEditSeries(db, "series")).toBe(true);
  expect(rpc.mock.calls).toEqual([["can_edit_event", { p_event_id: "event" }], ["can_edit_series", { p_series_id: "series" }]]);
});
it("fails closed on a denied result or database failure", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
  expect(await canEditEvent({ rpc } as unknown as Client, "event")).toBe(false);
  rpc.mockResolvedValue({ data: true, error: new Error("offline") });
  await expect(canEditSeries({ rpc } as unknown as Client, "series")).rejects.toThrow("offline");
});
