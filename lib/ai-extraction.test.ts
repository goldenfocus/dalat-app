import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  calculateSimilarity,
  getExtractionPrompt,
  checkDuplicates,
} from "./ai-extraction";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns string length for empty comparison", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  it("calculates single character difference", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("cat", "car")).toBe(1);
  });

  it("handles insertions and deletions", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });
});

describe("calculateSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for empty strings", () => {
    expect(calculateSimilarity("", "")).toBe(0);
    expect(calculateSimilarity("hello", "")).toBe(0);
  });

  it("normalizes Vietnamese diacritics", () => {
    // Diacritics like ́ ̂ are removed, but Đ is a distinct letter (not a combining mark)
    // "Phố Bên Đồi" normalizes to "phobeni" (Đ is stripped as non-ASCII)
    // "Pho Ben Doi" normalizes to "phobendoi"
    // Result: 8/9 = 0.888, which exceeds 0.8 threshold for deduplication
    expect(calculateSimilarity("Phố Bên Đồi", "Pho Ben Doi")).toBeGreaterThan(
      0.8
    );

    // Combining diacritics (like ́ on ố) ARE normalized correctly
    expect(calculateSimilarity("Café", "Cafe")).toBe(1);
  });

  it("ignores case differences", () => {
    expect(calculateSimilarity("Hello World", "hello world")).toBe(1);
  });

  it("ignores punctuation", () => {
    expect(calculateSimilarity("Hello, World!", "Hello World")).toBe(1);
  });

  it("detects similar but not identical titles", () => {
    const similarity = calculateSimilarity(
      "Live Music at Cafe",
      "Live Music Cafe"
    );
    expect(similarity).toBeGreaterThan(0.8);
  });
});

describe("getExtractionPrompt", () => {
  it("uses current year for mid-year dates", () => {
    const july2025 = new Date("2025-07-15");
    const prompt = getExtractionPrompt(july2025);

    // Should use 2025 for both early and late months
    expect(prompt).toContain("For dates in Jan-Mar, use year 2025");
    expect(prompt).toContain("For all other months, use year 2025");
  });

  it("uses next year for Jan-Mar when in Q4", () => {
    const november2025 = new Date("2025-11-15");
    const prompt = getExtractionPrompt(november2025);

    // In Q4, Jan-Mar should be next year
    expect(prompt).toContain("For dates in Jan-Mar, use year 2026");
    expect(prompt).toContain("For all other months, use year 2025");
  });

  it("uses next year for Jan-Mar when in December", () => {
    const december2025 = new Date("2025-12-25");
    const prompt = getExtractionPrompt(december2025);

    expect(prompt).toContain("For dates in Jan-Mar, use year 2026");
  });
});

describe("checkDuplicates", () => {
  const existingEvents = [
    {
      id: "event-1",
      title: "Live Jazz Night",
      starts_at: "2025-06-15T19:00:00+07:00",
      location_name: "Cafe XYZ",
    },
    {
      id: "event-2",
      title: "Acoustic Session",
      starts_at: "2025-06-20T20:00:00+07:00",
      location_name: "Bar ABC",
    },
  ];

  it("flags duplicate when title is very similar on same day", async () => {
    const extracted = [
      {
        title: "Live Jazz Night!!",
        starts_at: "2025-06-15T20:00:00+07:00",
        confidence: 0.9,
      },
    ];

    const result = await checkDuplicates(extracted, existingEvents);

    expect(result[0].duplicate_of).toBe("event-1");
    expect(result[0].duplicate_confidence).toBeGreaterThan(0.8);
  });

  it("does not flag duplicate when on different day", async () => {
    const extracted = [
      {
        title: "Live Jazz Night",
        starts_at: "2025-06-16T19:00:00+07:00", // Different day
        confidence: 0.9,
      },
    ];

    const result = await checkDuplicates(extracted, existingEvents);

    expect(result[0].duplicate_of).toBeUndefined();
  });

  it("does not flag unrelated events", async () => {
    const extracted = [
      {
        title: "Poetry Reading",
        starts_at: "2025-06-15T19:00:00+07:00",
        confidence: 0.9,
      },
    ];

    const result = await checkDuplicates(extracted, existingEvents);

    expect(result[0].duplicate_of).toBeUndefined();
  });

  // TODO: Implement this test case
  // This is a meaningful edge case: what should happen when titles are
  // similar but at different venues on the same day?
  // Example: "Live Music" at "Cafe A" vs "Live Music" at "Cafe B"
  // Currently the code doesn't consider venue - is that the right behavior?
});
