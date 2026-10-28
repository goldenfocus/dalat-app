import { describe, expect, it } from "vitest";
import {
  POST_PUBLISH_REVIEW_KEY,
  SCHEDULE_CHANGES_KEY,
  rewriteDateMentions,
  rewriteSlugDate,
  scheduleChanged,
  withScheduleChangeLog,
} from "./schedule-change";

const OLD = "2026-11-20T10:00:00.000Z"; // 20 Nov 17:00 ICT
const NEW = "2026-11-22T10:00:00.000Z"; // 22 Nov 17:00 ICT

describe("schedule change helpers", () => {
  it("detects start or end moves of a minute or more", () => {
    expect(
      scheduleChanged(
        { startsAt: OLD, endsAt: null },
        { startsAt: NEW, endsAt: null },
      ),
    ).toBe(true);
    expect(
      scheduleChanged(
        { startsAt: OLD, endsAt: "2026-11-20T12:00:00Z" },
        {
          startsAt: "2026-11-20T10:00:00+00:00",
          endsAt: "2026-11-20T12:00:00.000Z",
        },
      ),
    ).toBe(false);
    expect(
      scheduleChanged(
        { startsAt: OLD, endsAt: "2026-11-20T12:00:00Z" },
        { startsAt: OLD, endsAt: "2026-11-20T13:00:00Z" },
      ),
    ).toBe(true);
    expect(
      scheduleChanged(
        { startsAt: null, endsAt: null },
        { startsAt: NEW, endsAt: null },
      ),
    ).toBe(false);
  });

  it("rewrites Vietnamese and English date mentions in the Đà Lạt calendar", () => {
    expect(
      rewriteDateMentions(
        "Chương trình diễn ra vào ngày 20 tháng 11 năm 2026.",
        OLD,
        NEW,
      ),
    ).toBe("Chương trình diễn ra vào ngày 22 tháng 11 năm 2026.");
    expect(
      rewriteDateMentions(
        "Đêm nhạc 20/11/2026 lúc 17:00, mở cửa 20/11",
        OLD,
        NEW,
      ),
    ).toBe("Đêm nhạc 22/11/2026 lúc 17:00, mở cửa 22/11");
    expect(rewriteDateMentions("Live in DaLat 20.11.2026", OLD, NEW)).toBe(
      "Live in DaLat 22.11.2026",
    );
    expect(
      rewriteDateMentions(
        "On November 20th and Nov 20, also 20 November",
        OLD,
        NEW,
      ),
    ).toBe("On November 22 and Nov 22, also 22 November");
    expect(rewriteDateMentions("Room 120/11 stays; 2/11 too", OLD, NEW)).toBe(
      "Room 120/11 stays; 2/11 too",
    );
    // ICT evening across UTC midnight uses the local date.
    expect(
      rewriteDateMentions(
        "ngày 21/11",
        "2026-11-20T18:00:00Z",
        "2026-11-22T18:00:00Z",
      ),
    ).toBe("ngày 23/11");
  });

  it("moves a date embedded in a slug and leaves dateless slugs alone", () => {
    expect(rewriteSlugDate("tang-phuc-da-lat", OLD, NEW)).toBeNull();
    expect(rewriteSlugDate("dance-night-2026-11-20", OLD, NEW)).toBe(
      "dance-night-2026-11-22",
    );
    expect(rewriteSlugDate("acoustic-live-band-20112026", OLD, NEW)).toBe(
      "acoustic-live-band-22112026",
    );
    expect(rewriteSlugDate("show-20-11-2026-dl", OLD, NEW)).toBe(
      "show-22-11-2026-dl",
    );
  });

  it("logs the change and flags it for the post-publish review", () => {
    const metadata = withScheduleChangeLog(
      { keep: true, [SCHEDULE_CHANGES_KEY]: [{ old: 1 }] },
      {
        from: { startsAt: OLD, endsAt: null },
        to: { startsAt: NEW, endsAt: null },
        detectedAt: "2026-10-28T10:00:00.000Z",
        sourceUrl: "https://example.com/show",
        detector: "test",
      },
    );
    expect(metadata.keep).toBe(true);
    expect(metadata[SCHEDULE_CHANGES_KEY]).toHaveLength(2);
    expect(metadata[POST_PUBLISH_REVIEW_KEY]).toMatchObject({
      reason: "source_schedule_changed",
      from_starts_at: OLD,
      to_starts_at: NEW,
    });
  });
});
