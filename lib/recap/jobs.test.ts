import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueRecapRender } from "./jobs";

const EVENT = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";

function fakeClient(insert: unknown, existing?: unknown) {
  const single = vi.fn().mockResolvedValueOnce(insert);
  if (existing) single.mockResolvedValueOnce(existing);
  const chain = { select: () => chain, single, match: () => chain };
  const from = vi.fn(() => ({ insert: vi.fn(() => chain), select: () => chain }));
  return { client: { from } as unknown as SupabaseClient, from };
}

describe("enqueueRecapRender", () => {
  it("returns created=true for a fresh job", async () => {
    const { client } = fakeClient({ data: { id: JOB, status: "queued" }, error: null });
    const out = await enqueueRecapRender({ eventId: EVENT, spec: {}, sourceHash: "abcdef12" }, client);
    expect(out).toEqual({ id: JOB, status: "queued", created: true });
  });

  it("returns the existing row on a unique violation", async () => {
    const { client } = fakeClient(
      { data: null, error: { code: "23505", message: "dup" } },
      { data: { id: JOB, status: "done" }, error: null },
    );
    const out = await enqueueRecapRender({ eventId: EVENT, spec: {}, sourceHash: "abcdef12" }, client);
    expect(out).toEqual({ id: JOB, status: "done", created: false });
  });

  it("throws on other database errors and rejects bad input", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "denied" } });
    await expect(
      enqueueRecapRender({ eventId: EVENT, spec: {}, sourceHash: "abcdef12" }, client),
    ).rejects.toThrow("denied");
    await expect(
      enqueueRecapRender({ eventId: "nope", spec: {}, sourceHash: "abcdef12" }, client),
    ).rejects.toThrow();
  });
});
