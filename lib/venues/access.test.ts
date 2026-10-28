import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { venueEditor } from "./access";
let owner: string;
let role: string;
let manager: { role: string; accepted_at: string | null } | null;
beforeEach(() => {
  owner = "someone-else"; role = "user"; manager = null;
  mocks.client.mockImplementation(async () => ({ auth: { getUser: async () => ({ data: { user: { id: "slaven" } } }) }, from: (table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: async () => ({ data: table === "venues" ? { id: "venue", owner_id: owner } : table === "profiles" ? { role } : manager }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); return query;
  } }));
});
it("recognizes an ordinary account recorded as the venue owner", async () => {
  owner = "slaven";
  expect(await venueEditor("venue")).not.toBeNull();
});
it("requires an accepted editing role for invited managers", async () => {
  for (const invitation of [{ role: "owner", accepted_at: null }, { role: "editor", accepted_at: null }, { role: "viewer", accepted_at: "today" }]) {
    manager = invitation; expect(await venueEditor("venue")).toBeNull();
  }
  manager = { role: "editor", accepted_at: "today" };
  expect(await venueEditor("venue")).not.toBeNull();
});
it("does not let an unrelated user edit a venue", async () => {
  expect(await venueEditor("venue")).toBeNull();
});
