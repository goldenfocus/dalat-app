import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), load: vi.fn() }));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const query: any = { select: () => query, eq: () => query, in: () => mocks.load() };
      return query;
    },
  }),
}));
import { EventTranslationRefresh } from "./event-translation-refresh";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("open event translation refresh", () => {
  it("refreshes after missing localized prose arrives", async () => {
    vi.useFakeTimers();
    mocks.load.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [{ field_name: "description", translated_text: "Walk around the lake" }], error: null,
    });
    render(<EventTranslationRefresh eventId="event" locale="en" title="Potluck" description="Đi bộ quanh hồ" />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("stops polling when the displayed locale is complete", async () => {
    vi.useFakeTimers();
    mocks.load.mockResolvedValue({ data: [
      { field_name: "title", translated_text: "Potluck" },
      { field_name: "description", translated_text: "Walk around the lake" },
    ], error: null });
    render(<EventTranslationRefresh eventId="event" locale="en" title="Potluck" description="Walk around the lake" />);
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(20_000); });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
