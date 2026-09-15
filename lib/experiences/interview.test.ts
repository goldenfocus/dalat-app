import { describe, it, expect } from "vitest";
import { interviewInstructions, monologueCommand } from "./interview";
describe("adaptive interviewing", () => {
  it("quick and natural have different question budgets; story has no count cutoff", () => {
    expect(interviewInstructions("quick", 2)).toContain(
      "Do not ask further factual questions",
    );
    expect(interviewInstructions("natural", 2)).toContain("two or three");
    expect(interviewInstructions("story", 50)).toContain(
      "without a question-count cutoff",
    );
  });
  it.each([
    "That's enough.",
    "I’m finished.",
    "Prepare it.",
    "Publish it.",
    "It was fun. That's enough.",
    "Tôi đã xong.",
    "J’ai terminé.",
  ])("finishes silent mode for %s without publication", (text) =>
    expect(monologueCommand(text)).toBe("finish"),
  );
  it.each([
    "My friend said that's enough.",
    "I don't want to finish.",
    "The dish is called ‘I'm done’.",
  ])("does not finish on a story or negation: %s", (text) =>
    expect(monologueCommand(text)).toBeNull(),
  );
  it("allows more questions after silent listening", () =>
    expect(monologueCommand("Ask me more.")).toBe("story"));
  it("never interprets publication language as permission to publish", () =>
    expect(interviewInstructions("story")).toContain(
      "actual publication requires the visible Publish action",
    ));
});
