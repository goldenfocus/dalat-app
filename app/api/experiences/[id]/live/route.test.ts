// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  admin: vi.fn(),
  safe: vi.fn(),
}));
vi.mock("@/lib/experiences/server", () => ({
  ownerExperience: mocks.owner,
  experienceAdmin: mocks.admin,
  safeMutation: mocks.safe,
}));
import { POST, PUT } from "./route";
const context = { params: Promise.resolve({ id: "draft" }) };
function request(body: string, method = "POST") {
  return new Request("https://dalat.app/api/experiences/draft/live", {
    method,
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.safe.mockReturnValue(true);
  mocks.owner.mockResolvedValue({
    experience: { status: "draft" },
    user: { id: "owner" },
  });
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
});
afterEach(() => vi.unstubAllEnvs());
describe("private live interview boundary", () => {
  it("rejects cross-origin and non-owner calls before using a provider", async () => {
    mocks.safe.mockReturnValue(false);
    expect((await POST(request("v=0"), context)).status).toBe(403);
    mocks.safe.mockReturnValue(true);
    mocks.owner.mockResolvedValue(null);
    expect((await POST(request("v=0"), context)).status).toBe(404);
    expect((await PUT(request("[]", "PUT"), context)).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("cannot start or edit a published experience", async () => {
    mocks.owner.mockResolvedValue({ experience: { status: "published" } });
    expect((await POST(request("v=0"), context)).status).toBe(409);
    expect((await PUT(request("[]", "PUT"), context)).status).toBe(409);
  });
  it("rejects invalid SDP and malformed conversation before writing", async () => {
    expect((await POST(request("<html>"), context)).status).toBe(400);
    expect(
      (await PUT(request('[{"role":"system"}]', "PUT"), context)).status,
    ).toBe(400);
    expect(
      (await PUT(request("x".repeat(250001), "PUT"), context)).status,
    ).toBe(413);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses the existing attempt limiter before negotiating", async () => {
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false }),
    });
    expect((await POST(request("v=0"), context)).status).toBe(429);
  });
  it("persists bounded turns through the deduplicating private append", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ rpc });
    const turns = [
      {
        id: "turn",
        role: "user",
        text: "I enjoyed the university event.",
        at: "2026-09-13T10:00:00Z",
      },
    ];
    expect(
      (await PUT(request(JSON.stringify(turns), "PUT"), context)).status,
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith("append_experience_live_turns", {
      p_id: "draft",
      p_turns: turns,
    });
  });
});
