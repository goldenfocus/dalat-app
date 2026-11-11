import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkGuestArrival } from "./link-account";

const hash = "a".repeat(64);
type Row = { id: string; user_id: string | null } | null;
type Result = { data: unknown; error: { code: string } | null };

function fakeAdmin({ guest, own, update }: { guest?: Row; own?: Row; update?: Result }) {
  const calls: { op: string; filters: [string, unknown][]; values?: unknown }[] = [];
  const admin = {
    from(table: string) {
      expect(table).toBe("event_arrival_participants");
      const call: { op: string; filters: [string, unknown][]; values?: unknown } = { op: "select", filters: [] };
      calls.push(call);
      const builder = {
        select: () => builder,
        update: (values: unknown) => { call.op = "update"; call.values = values; return builder; },
        eq: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
        is: (column: string, value: unknown) => { call.filters.push([`${column}:is`, value]); return builder; },
        maybeSingle: async () => ({ data: call.filters.some(([column]) => column === "token_hash") ? guest ?? null : own ?? null, error: null }),
        then: (resolve: (value: Result) => unknown) => Promise.resolve(update ?? { data: [{ id: guest?.id }], error: null }).then(resolve),
      };
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

describe("linkGuestArrival", () => {
  it("attaches an unowned guest arrival to the signed-in account without changing its id", async () => {
    const { admin, calls } = fakeAdmin({ guest: { id: "p1", user_id: null } });
    expect(await linkGuestArrival(admin, "e1", "u1", hash)).toBe(true);
    const write = calls.find(call => call.op === "update")!;
    expect(write.values).toEqual({ user_id: "u1" });
    expect(write.filters).toEqual([["id", "p1"], ["event_id", "e1"], ["user_id:is", null]]);
  });

  it("does nothing without a guest arrival, or when it already belongs to an account", async () => {
    for (const guest of [null, { id: "p1", user_id: "someone-else" }]) {
      const { admin, calls } = fakeAdmin({ guest });
      expect(await linkGuestArrival(admin, "e1", "u1", hash)).toBe(false);
      expect(calls.some(call => call.op === "update")).toBe(false);
    }
  });

  it("keeps the account's own arrival and leaves the guest row alone", async () => {
    const { admin, calls } = fakeAdmin({ guest: { id: "p1", user_id: null }, own: { id: "p2", user_id: "u1" } });
    expect(await linkGuestArrival(admin, "e1", "u1", hash)).toBe(false);
    expect(calls.some(call => call.op === "update")).toBe(false);
  });

  it("treats a unique violation or a lost race as not linked", async () => {
    const conflict = fakeAdmin({ guest: { id: "p1", user_id: null }, update: { data: null, error: { code: "23505" } } });
    expect(await linkGuestArrival(conflict.admin, "e1", "u1", hash)).toBe(false);
    const raced = fakeAdmin({ guest: { id: "p1", user_id: null }, update: { data: [], error: null } });
    expect(await linkGuestArrival(raced.admin, "e1", "u1", hash)).toBe(false);
  });

  it("rejects a malformed token and never throws on a database failure", async () => {
    const { admin, calls } = fakeAdmin({ guest: { id: "p1", user_id: null } });
    expect(await linkGuestArrival(admin, "e1", "u1", "not-a-hash")).toBe(false);
    expect(calls).toHaveLength(0);
    const broken = { from: vi.fn(() => { throw new Error("down"); }) } as unknown as SupabaseClient;
    expect(await linkGuestArrival(broken, "e1", "u1", hash)).toBe(false);
  });
});
