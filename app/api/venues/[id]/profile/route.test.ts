import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ editor: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/venues/access", () => ({ venueEditor: mocks.editor }));
vi.mock("@/lib/experiences/server", () => ({ experienceAdmin: () => ({ from: () => ({ update: mocks.update }) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PATCH } from "./route";
const context = { params: Promise.resolve({ id: "venue" }) };
const request = (body: unknown) => new Request("https://dalat.app/api/venues/venue/profile", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.editor.mockResolvedValue({ user: { id: "owner" } }); mocks.update.mockReturnValue({ eq: async () => ({ error: null }) }); });
it("saves a trimmed venue name without changing its canonical slug", async () => {
  expect((await PATCH(request({ name: " Socialhouse Dalat " }), context)).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Socialhouse Dalat" }));
  expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("slug");
});
it("rejects blank names and non-editors", async () => {
  expect((await PATCH(request({ name: " " }), context)).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.editor.mockResolvedValue(null);
  expect((await PATCH(request({ name: "New name" }), context)).status).toBe(403);
});
