import { describe, it, expect } from "vitest";
import { translationWorkState } from "./work-status";
describe("translation queue ownership", () => {
  it("retains completed copy when only another field needs work", () => {
    expect(
      translationWorkState({
        translated_text: "Geprüfter Text",
        translation_status: "auto",
        ai_reviewed_at: "2026-10-28T00:00:00Z",
      }),
    ).toBe("ready");
  });
  it("separates stale human reviews from executable work", () => {
    expect(
      translationWorkState(
        {
          translated_text: "Old human text",
          translation_status: "reviewed",
          is_stale: true,
        },
        { force: true },
      ),
    ).toBe("blocked");
  });
  it("reviews new fallback rows and leaves older coverage intact", () => {
    const options = { reviewAfter: "2026-10-28T00:00:00Z" };
    expect(
      translationWorkState(
        {
          translated_text: "Text",
          translation_status: "auto",
          updated_at: "2026-10-28T00:01:00Z",
        },
        options,
      ),
    ).toBe("pending");
    expect(
      translationWorkState(
        {
          translated_text: "Text",
          translation_status: "auto",
          updated_at: "2026-10-27T00:01:00Z",
        },
        options,
      ),
    ).toBe("ready");
  });
});
