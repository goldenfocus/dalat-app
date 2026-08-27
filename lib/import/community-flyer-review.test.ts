import { describe, expect, it } from "vitest";
import { sanitizeCommunityFlyerRow, sanitizeCommunityFlyerUrl } from "./community-flyer-review";

describe("community flyer review sanitization", () => {
  it("returns only safe moderator-facing fields", () => {
    expect(sanitizeCommunityFlyerRow({
      id: "queue-1",
      status: "pending",
      created_at: "2026-08-26T00:00:00.000Z",
      payload: {
        title: "  Flower\nNight  ",
        flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/user/flyer.png#x",
        submittedBy: "private-user-id",
      },
    })).toEqual({
      id: "queue-1",
      status: "pending",
      title: "Flower Night",
      flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/user/flyer.png",
      createdAt: "2026-08-26T00:00:00.000Z",
      errorDetail: null,
    });
  });

  it("rejects non-CDN, non-HTTPS, and out-of-lane image URLs", () => {
    expect(sanitizeCommunityFlyerUrl("http://cdn.dalat.app/event-media/community-suggestions/x.jpg")).toBeNull();
    expect(sanitizeCommunityFlyerUrl("https://evil.test/event-media/community-suggestions/x.jpg")).toBeNull();
    expect(sanitizeCommunityFlyerUrl("https://cdn.dalat.app/moments/x.jpg")).toBeNull();
  });

  it("keeps failed rows reviewable but drops done rows", () => {
    const payload = { flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/u/x.jpg" };
    expect(sanitizeCommunityFlyerRow({ id: "x", status: "failed", payload })).not.toBeNull();
    expect(sanitizeCommunityFlyerRow({ id: "x", status: "done", payload })).toBeNull();
  });
});
