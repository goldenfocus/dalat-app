import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ has: vi.fn(), rpc: vi.fn(), getUser: vi.fn(), createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ has: mocks.has }) }));
vi.mock("@/lib/god-mode", () => ({ getGodModeAdminTokenCookieName: () => "god_mode_admin_refresh" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.rpc.mockResolvedValue({ data: { ok: true, updated: true }, error: null });
});
it("does not record target activity during god mode", async () => {
  mocks.has.mockReturnValue(true);
  expect(await (await POST()).json()).toEqual({ ok: true, updated: false });
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("continues recording real user activity", async () => {
  mocks.has.mockReturnValue(false);
  expect((await POST()).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("record_user_activity");
});
it("still rejects unauthenticated activity", async () => {
  mocks.has.mockReturnValue(false);
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await POST()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
