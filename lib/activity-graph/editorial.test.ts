import { describe, it, expect, vi } from "vitest";
import { explainActivity } from "./editorial";
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

  it("rejects an empty explanation instead of publishing it", async () => {
    chat.mockResolvedValue({ description: " " });
    await expect(explainActivity({ title: "Event" } as ExtractedActivity)).rejects.toThrow("empty");
  });
});
