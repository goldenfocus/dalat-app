import { describe, it, expect, vi } from "vitest";
import {
  activityExplanationFacts,
  explainActivity,
  shouldReuseStoredExplanation,
} from "./editorial";
import type { ExtractedActivity } from "./types";
const chat = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/provider", () => ({ aiChatJson: chat }));

describe("activity editorial copy", () => {
  it("passes event evidence but excludes generated media and preserves structured facts", async () => {
    const activity = { title: "Đêm hội Trung thu", description: "Children and visitors", startsAt: "2026-09-24T23:59:59+07:00", timePrecision: "tba", evidence: [], curatedMedia: { caption: "Invented lion dance" } } as unknown as ExtractedActivity;
    chat.mockResolvedValue({ description: "Một đêm hội dành cho thiếu nhi.\n\nGiờ bắt đầu chưa được công bố." });
    const result = await explainActivity(activity);
    expect(result.startsAt).toBe(activity.startsAt);
    expect(result.title).toBe(activity.title);
    const request = chat.mock.calls.at(-1)![0];
    expect(JSON.parse(request.prompt).timePrecision).toBe("tba");
    expect(request.prompt).not.toContain("Invented lion dance");
    expect(request.system).toContain("another location");
    expect(result.description).toContain("\n\n");
  });

  it("reuses a stored explanation until the title or venue changes", () => {
    const activity = {
      title: "Live Acoustic • Dưới Tán Anh Đào",
      locationName: "Dưới Tán Anh Đào",
      description: "Nhạc acoustic trực tiếp.",
    } as unknown as ExtractedActivity;
    expect(shouldReuseStoredExplanation({
      title: activity.title,
      locationName: activity.locationName,
      description: "Bản mô tả đã xuất bản.",
      facts: null,
    }, activity)).toBe(true);
    expect(shouldReuseStoredExplanation({
      title: "Tên cũ",
      locationName: activity.locationName,
      description: "Bản mô tả đã xuất bản.",
      facts: null,
    }, activity)).toBe(false);
  });

  it("reuses stored facts that jsonb returned in a different key order", () => {
    const activity = {
      title: "TRUNG QUÂN - ĐÀ LẠT",
      kind: "event",
      locationName: "Mây Lang Thang",
      address: "Mây Lang Thang",
      startsAt: "2026-10-31T10:00:00.000Z",
      endsAt: "2026-10-31T12:00:00.000Z",
      timePrecision: "exact",
      startsAtTime: null,
      durationMinutes: 120,
      rrule: null,
      reservationRequirement: "required",
      publicAccess: "confirmed",
      priceType: "paid",
      attributes: {},
      description: "Mây Lang Thang",
    } as unknown as ExtractedActivity;
    const facts = activityExplanationFacts(activity);
    const jsonbOrder = Object.fromEntries(
      Object.entries(facts).sort(
        ([a], [b]) => a.length - b.length || a.localeCompare(b),
      ),
    );
    expect(JSON.stringify(jsonbOrder)).not.toBe(JSON.stringify(facts));
    expect(
      shouldReuseStoredExplanation(
        { description: "Bản mô tả.", facts: jsonbOrder },
        activity,
      ),
    ).toBe(true);
    expect(
      shouldReuseStoredExplanation(
        { description: "Bản mô tả.", facts: jsonbOrder },
        { ...activity, startsAt: "2026-11-02T10:00:00.000Z" },
      ),
    ).toBe(false);
  });

  it("rejects an empty explanation instead of publishing it", async () => {
    chat.mockResolvedValue({ description: " " });
    await expect(explainActivity({ title: "Event" } as ExtractedActivity)).rejects.toThrow("empty");
  });
});
