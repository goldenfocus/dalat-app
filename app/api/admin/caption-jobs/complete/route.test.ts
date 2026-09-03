import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  prepare: vi.fn(),
  after: vi.fn(),
  revalidate: vi.fn(),
  translate: vi.fn(),
}));
vi.mock("@/lib/ai/image-jobs", () => ({ getImageJobsAdmin: mocks.admin }));
vi.mock("@/lib/blog/enqueue-recap", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  prepareRecapInput: mocks.prepare,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  after: mocks.after,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/translations", () => ({
  triggerTranslationServer: mocks.translate,
}));
import { POST } from "./route";

const valid = JSON.stringify({
  story_content:
    "The shared recordings from the Đà Lạt meetup show a discussion around a table.",
  meta_description: "A recorded discussion at the Đà Lạt meetup.",
  seo_keywords: ["Đà Lạt meetup"],
  social_share_text: "Explore the meetup recordings.",
  suggested_cta_text: "View moments",
});
const job = {
  id: "job",
  event_id: "e1",
  moment_id: null,
  status: "processing",
  content_type: "recap",
  prompt: "current evidence",
  claimed_at: "2026-09-01T00:00:00Z",
};
function database(responses: Record<string, unknown[]>) {
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const data = responses[table]?.shift();
      if (data === undefined) throw new Error(`Unexpected query ${table}`);
      const chain: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "single",
        "maybeSingle",
        "upsert",
        "update",
      ])
        chain[method] = (value: Record<string, unknown>) => {
          if (["upsert", "update"].includes(method))
            writes.push({ table, value });
          return chain;
        };
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve);
      return chain;
    },
  };
  mocks.admin.mockReturnValue(db);
  return writes;
}
function request(output = valid) {
  return new Request("https://dalat.app/api/admin/caption-jobs/complete", {
    method: "POST",
    headers: {
      authorization: "Bearer test-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jobId: "job", output, provider: "ollama" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_API_KEY", "test-key");
  mocks.prepare.mockResolvedValue({
    outcome: "ready",
    prompt: "current evidence",
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("automatic recap publication", () => {
  it("publishes on the original event without a moderator and refreshes its page", async () => {
    const writes = database({
      caption_jobs: [job, null],
      events: [
        {
          id: "e1",
          title: "Meetup",
          slug: "meetup",
          status: "published",
          has_private_details: false,
          tribe_id: null,
        },
        null,
      ],
      blog_categories: [{ id: "cat" }],
      blog_posts: [null, { id: "post" }],
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const post = writes.find((write) => write.table === "blog_posts")!.value;
    expect(post).toMatchObject({
      status: "draft",
      source_locale: "en",
      event_id: "e1",
    });
    expect(Date.parse(post.recap_published_at as string)).not.toBeNaN();
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/[locale]/events/[slug]",
      "page",
    );
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it.each([
    { outcome: "skipped", reason: "awaiting_media" },
    { outcome: "skipped", reason: "private" },
    { outcome: "ready", prompt: "newly uploaded evidence" },
  ])("cannot publish stale or incomplete evidence: %j", async (prepared) => {
    const writes = database({ caption_jobs: [job] });
    mocks.prepare.mockResolvedValue(prepared);
    expect((await POST(request())).status).toBe(422);
    expect(writes).toEqual([]);
  });
  it("rejects malformed output before any publication", async () => {
    const writes = database({ caption_jobs: [job] });
    expect((await POST(request('{"story_content":""}'))).status).toBe(422);
    expect(writes).toEqual([]);
  });
  it("does not accept work for an unclaimed job", async () => {
    const writes = database({ caption_jobs: [{ ...job, status: "pending" }] });
    expect((await POST(request())).status).toBe(409);
    expect(writes).toEqual([]);
  });
});
