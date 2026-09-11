// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  upsert: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.role ? { role: state.role } : null,
          }),
        }),
      }),
      upsert: state.upsert,
    }),
  }),
}));
import { GET, POST } from "./route";
const request = (body: unknown) =>
  new Request("https://phuong.dalat.app/api/phuong-ideas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://phuong.dalat.app",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  state.user = null;
  state.role = null;
  state.upsert.mockReset();
  state.upsert.mockResolvedValue({ error: null });
});
it("requires membership for read and write", async () => {
  expect((await GET()).status).toBe(401);
  expect((await POST(request({}))).status).toBe(401);
  state.user = { id: "outsider" };
  expect((await GET()).status).toBe(403);
  expect((await POST(request({}))).status).toBe(403);
  expect(state.upsert).not.toHaveBeenCalled();
});
it.each(["phuong", "zan"])(
  "saves the authenticated author's vote for %s",
  async (role) => {
    state.user = { id: role + "-id" };
    state.role = role;
    expect(
      (await POST(request({ ideaId: "drink", rating: "up" }))).status,
    ).toBe(200);
    expect(state.upsert).toHaveBeenCalledWith(
      { user_id: role + "-id", idea_id: "drink", rating: "up" },
      { onConflict: "user_id,idea_id" },
    );
  },
);
it("rejects impersonation and invalid idea IDs", async () => {
  state.user = { id: "yan" };
  state.role = "zan";
  expect(
    (await POST(request({ ideaId: "drink", rating: "up", user_id: "phuong" })))
      .status,
  ).toBe(400);
  expect(
    (await POST(request({ ideaId: "unknown", rating: "up" }))).status,
  ).toBe(400);
  expect(state.upsert).not.toHaveBeenCalled();
});
