// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "author-a" } as { id: string } | null, write: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) }, from: state.from }) }));
import { GET, POST } from "./route";
const request = (body: unknown, origin = "https://phuong.dalat.app") => new Request("https://phuong.dalat.app/api/workshop-answers", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => {
  state.user = { id: "author-a" }; state.write.mockReset(); state.from.mockReset();
  state.from.mockReturnValue({ upsert: state.write });
  state.write.mockReturnValue({ select: () => ({ single: async () => ({ data: { question_id: 1, content: "My answer", updated_at: "2026-09-10" }, error: null }) }) });
});
describe("private workshop API", () => {
  it("rejects anonymous reading and writing, with non-cacheable responses", async () => {
    state.user = null;
    for (const response of [await GET(), await POST(request({ question_id: 1, content: "x" }))]) {
      expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("private, no-store");
    }
    expect(state.from).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes", async () => {
    expect((await POST(request({}, "https://other.example"))).status).toBe(403);
    expect(state.write).not.toHaveBeenCalled();
  });
  it.each([null, {}, {question_id: 0, content: "x"}, {question_id: 7, content: "x"}, {question_id: 1, content: 4}, {question_id: 1, content: "x".repeat(6001)}])("rejects invalid payload %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(state.write).not.toHaveBeenCalled();
  });
  it("refuses to attribute a stale editor to another signed-in account", async () => {
    expect((await POST(request({ question_id: 1, content: "x", expected_author_id: "author-b" }))).status).toBe(409);
    expect(state.write).not.toHaveBeenCalled();
  });
  it("derives authorship from authentication, never a supplied author_id", async () => {
    const response = await POST(request({ question_id: 1, content: "My answer", expected_author_id: "author-a", author_id: "victim" }));
    expect(response.status).toBe(200);
    expect(state.write).toHaveBeenCalledWith(expect.objectContaining({ author_id: "author-a", content: "My answer" }), expect.anything());
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });
});
