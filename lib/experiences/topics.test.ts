import { expect, it } from "vitest";
import {
  topic,
  topicHref,
  topicTerms,
  observationParts,
  experienceTopics,
} from "./topics";
it("groups explicit equivalents without conflating distinct dietary or atmosphere claims", () => {
  expect(topic("#Yên-Tĩnh")).toBe("quiet");
  expect(topicTerms("quiet")).toContain("yên tĩnh");
  expect(topic("peaceful")).toBe("peaceful");
  expect(topic("vegan")).not.toBe(topic("vegetarian"));
});
it("links individual reported descriptors while retaining punctuation and attribution text", () => {
  const parts = observationParts("spicy, salty, sugary", [], "firsthand");
  expect(parts.map((p) => p.topic).filter(Boolean)).toEqual([
    "spicy",
    "salty",
    "sweet",
  ]);
  expect(parts.map((p) => p.text).join("")).toBe("spicy, salty, sugary");
  expect(observationParts("quiet", [], "impression")[0].topic).toBe("quiet");
});
it("does not promote negation, inferred claims, prices or estimates to descriptive topics", () => {
  for (const value of [
    "not quiet",
    "not vegetarian",
    "around 50 seats",
    "30,000 dong",
  ])
    expect(observationParts(value, [], "firsthand").some((p) => p.topic)).toBe(
      false,
    );
  expect(observationParts("quiet", [], "inferred")[0].topic).toBeUndefined();
});
it("includes existing custom tags, deduplicates and validates bounded URL input", () => {
  expect(
    experienceTopics(
      ["quiet", "Yên tĩnh", "rainy-day"],
      [{ value: "quiet", source_type: "firsthand" }],
    ),
  ).toEqual(["quiet", "rainy day"]);
  expect(topicTerms("constructor")).toEqual(["constructor"]);
  expect(topic("x".repeat(51))).toBeUndefined();
  expect(topic("quiet),status.eq.draft")).toBeUndefined();
  expect(topicHref("Yên tĩnh", "food", 2)).toBe(
    "/experiences?tag=quiet&category=food&page=2",
  );
});
