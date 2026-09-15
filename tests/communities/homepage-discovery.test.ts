// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({ createStaticClient: () => ({ rpc }) }));
import { getActiveHomepageTribes } from "@/lib/tribes";

describe("homepage community discovery", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves the database's non-admin membership ranking", async () => {
    const ranked = [{ id: "large", member_count: 21 }, { id: "small", member_count: 2 }];
    rpc.mockResolvedValue({ data: ranked, error: null });
    expect(await getActiveHomepageTribes()).toEqual(ranked);
    expect(rpc).toHaveBeenCalledWith("get_active_homepage_communities");
  });
  it("hides the strip when no communities qualify", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getActiveHomepageTribes()).toEqual([]);
  });
  it("does not fall back to empty communities on a query failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await getActiveHomepageTribes()).toEqual([]);
    vi.restoreAllMocks();
  });
});
