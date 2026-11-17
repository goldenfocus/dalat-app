import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ after: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  }),
}));

import { schedulePublishedEventTranslation } from "./event-translation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("published event background lifetime", () => {
  it("keeps after() pending until the translation task finishes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    let finish!: (value: { data: null; error: null }) => void;
    mocks.maybeSingle.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    schedulePublishedEventTranslation("published-event");
    const callback = mocks.after.mock.calls[0][0];
    const task = callback();
    expect(task).toBeInstanceOf(Promise);
    let settled = false;
    void task.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish({ data: null, error: null });
    await task;
    expect(settled).toBe(true);
  });
});
