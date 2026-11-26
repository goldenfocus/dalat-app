import { describe, expect, it } from "vitest";
import {
  confirmingSourceUrls,
  hasLockedSchedule,
  mayUnlistLockedSchedule,
  otherConfirmingSourceUrls,
} from "./schedule-lock";

describe("hasLockedSchedule", () => {
  it("is false by default so official refreshes can still move a date", () => {
    expect(hasLockedSchedule(null)).toBe(false);
    expect(hasLockedSchedule({})).toBe(false);
    expect(hasLockedSchedule({ schedule_locked: false })).toBe(false);
  });

  it("holds a manually corrected schedule so Activity Graph cannot revert it", () => {
    expect(hasLockedSchedule({ schedule_locked: true })).toBe(true);
  });
});

describe("confirmingSourceUrls", () => {
  it("collects source_url, article_url, and source_urls_confirming, de-duplicated", () => {
    expect(
      confirmingSourceUrls({
        source_url: "https://baolamdong.vn/opening/",
        article_url: "https://dalat-info.gov.vn/festival",
        source_urls_confirming: [
          "https://baolamdong.vn/opening",
          "https://dantri.com.vn/festival",
          "not-a-url",
        ],
      }),
    ).toEqual([
      "https://baolamdong.vn/opening",
      "https://dalat-info.gov.vn/festival",
      "https://dantri.com.vn/festival",
    ]);
  });
});

describe("otherConfirmingSourceUrls", () => {
  it("drops the already-dead source, including trailing-slash aliases", () => {
    expect(
      otherConfirmingSourceUrls(
        {
          source_url: "https://baolamdong.vn/old-12-12",
          source_urls_confirming: [
            "https://baolamdong.vn/old-12-12/",
            "https://dantri.com.vn/festival",
          ],
        },
        "https://baolamdong.vn/old-12-12/",
      ),
    ).toEqual(["https://dantri.com.vn/festival"]);
  });
});

describe("mayUnlistLockedSchedule", () => {
  it("refuses to unlist a locked row for a single dead source", () => {
    expect(mayUnlistLockedSchedule(0)).toBe(false);
  });

  it("allows unlist only when at least one other confirming source is also gone", () => {
    expect(mayUnlistLockedSchedule(1)).toBe(true);
    expect(mayUnlistLockedSchedule(2)).toBe(true);
  });
});
