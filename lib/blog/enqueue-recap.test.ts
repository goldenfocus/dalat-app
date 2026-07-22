import { describe, it, expect } from "vitest";
import {
  selectAutoRecapCandidates,
  AUTO_RECAP_MIN_AGE_HOURS,
  AUTO_RECAP_WINDOW_DAYS,
  type AutoRecapEventRow,
} from "./enqueue-recap";

const NOW = new Date("2026-07-22T12:00:00Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

const event = (over: Partial<AutoRecapEventRow> = {}): AutoRecapEventRow => ({
  id: "e1",
  status: "published",
  starts_at: hoursAgo(52),
  ends_at: hoursAgo(48),
  has_private_details: false,
  tribe_id: null,
  tribe_visibility: null,
  ...over,
});

describe("selectAutoRecapCandidates — the cron's window + privacy filter", () => {
  it("keeps a published event that ended two days ago", () => {
    expect(selectAutoRecapCandidates([event()], NOW)).toHaveLength(1);
  });

  it("waits out the fresh-event floor so the photo wave can settle", () => {
    const justEnded = event({
      ends_at: hoursAgo(AUTO_RECAP_MIN_AGE_HOURS - 2),
    });
    expect(selectAutoRecapCandidates([justEnded], NOW)).toHaveLength(0);
  });

  it("ages events out past the window ceiling", () => {
    const ancient = event({
      starts_at: hoursAgo((AUTO_RECAP_WINDOW_DAYS + 1) * 24 + 4),
      ends_at: hoursAgo((AUTO_RECAP_WINDOW_DAYS + 1) * 24),
    });
    expect(selectAutoRecapCandidates([ancient], NOW)).toHaveLength(0);
  });

  it("falls back to starts_at when ends_at is null", () => {
    const openEnded = event({ starts_at: hoursAgo(48), ends_at: null });
    expect(selectAutoRecapCandidates([openEnded], NOW)).toHaveLength(1);
  });

  it("excludes draft and cancelled events", () => {
    const rows = [event({ status: "draft" }), event({ status: "cancelled" })];
    expect(selectAutoRecapCandidates(rows, NOW)).toHaveLength(0);
  });

  it("excludes secret-address events (privacy fence)", () => {
    expect(
      selectAutoRecapCandidates([event({ has_private_details: true })], NOW)
    ).toHaveLength(0);
  });

  it("excludes members-only tribe events but keeps public tribe events", () => {
    const membersOnly = event({ tribe_id: "t1", tribe_visibility: "members_only" });
    const publicTribe = event({ id: "e2", tribe_id: "t1", tribe_visibility: "public" });
    expect(selectAutoRecapCandidates([membersOnly, publicTribe], NOW)).toEqual([
      publicTribe,
    ]);
  });
});
