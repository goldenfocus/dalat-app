import { describe, it, expect } from "vitest";
import { liveConversationSchema, liveEvidence } from "./live-schema";
import { emptyStory, storySchema } from "./schema";
describe("live experience evidence", () => {
  it("never turns the interviewer's words into contributor evidence", () => {
    const turns = liveConversationSchema.parse([
      {
        id: "u1",
        role: "user",
        text: "I enjoyed the university event.",
        at: "2026-09-13T12:00:00Z",
      },
      {
        id: "a1",
        role: "assistant",
        text: "Was admission free?",
        at: "2026-09-13T12:00:01Z",
      },
    ]);
    expect(liveEvidence(turns)).toBe("I enjoyed the university event.");
  });
  it("bounds private conversation size and rejects unknown roles", () => {
    expect(
      liveConversationSchema.safeParse([
        { id: "x", role: "system", text: "x", at: "2026-09-13T12:00:00Z" },
      ]).success,
    ).toBe(false);
    expect(
      liveConversationSchema.safeParse(
        Array(201).fill({
          id: "x",
          role: "user",
          text: "x",
          at: "2026-09-13T12:00:00Z",
        }),
      ).success,
    ).toBe(false);
  });
  it("supports wellness without presuming a meal", () => {
    expect(emptyStory("en").category).toBe("other");
    expect(
      storySchema.safeParse({ ...emptyStory("en"), category: "wellness" })
        .success,
    ).toBe(true);
  });
});
