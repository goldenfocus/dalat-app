import { describe, it, expect } from "vitest";
import { TRANSLATION_SOURCES, sourceFields } from "./registry";
describe("public translation source contract", () => {
  it("covers each published content family, lyrics and generated captions", () => {
    expect(new Set(TRANSLATION_SOURCES.map((x) => x.type))).toEqual(
      new Set([
        "venue",
        "organizer",
        "tribe",
        "experience",
        "menu_item",
        "menu_section",
        "festival",
        "comment",
        "event",
        "moment",
        "profile",
        "blog",
        "track",
        "people",
      ]),
    );
    expect(TRANSLATION_SOURCES.some((x) => x.table === "moment_metadata")).toBe(
      true,
    );
  });
  it("does not queue photo URLs with no source captions", () => {
    const def = TRANSLATION_SOURCES.find((x) => x.type === "venue")!;
    expect(
      sourceFields(def, { photos: [{ url: "https://example.com/photo" }] }),
    ).toEqual({});
  });
  it("excludes private technical draft notes from public event recaps", () => {
    const def = TRANSLATION_SOURCES.find((x) => x.type === "blog")!;
    expect(
      sourceFields(def, {
        status: "draft",
        title: "Community dinner",
        story_content: "A public recap",
        technical_content: "Private storage notes",
      }),
    ).toEqual({ title: "Community dinner", story_content: "A public recap" });
  });
  it("never asks a model to rewrite venue identity or URLs", () => {
    const def = TRANSLATION_SOURCES.find((x) => x.type === "venue")!;
    expect(
      sourceFields(def, {
        name: "Social House Dalat",
        slug: "social-house-dalat",
        description: "A café.",
        website_url: "https://example.com",
      }),
    ).toEqual({ description: "A café." });
  });
  it("does not truncate long text or include observation attribution as translatable prose", () => {
    const def = TRANSLATION_SOURCES.find((x) => x.type === "experience")!;
    const narrative = "long ".repeat(3000);
    const fields = sourceFields(def, {
      narrative,
      observations: [
        {
          subject: "Food",
          value: "Warm",
          context: "At lunch",
          source_type: "firsthand",
          confidence: 1,
          evidence: "source",
        },
      ],
      photos: [{ id: "photo-id", alt: "Dinner", caption: "Our meal" }],
    });
    expect(fields.narrative).toBe(narrative);
    expect(JSON.parse(fields.observations)).toEqual([
      { subject: "Food", value: "Warm", context: "At lunch" },
    ]);
    expect(JSON.parse(fields.photos)).toEqual([
      { alt: "Dinner", caption: "Our meal" },
    ]);
  });
});


it("queues all public AI label prose in stable order without colors or model diagnostics", () => {
  const def = TRANSLATION_SOURCES.find((x) => x.table === "moment_metadata")!;
  const fields = sourceFields(def, {
    ai_tags: ["coffee"], detected_objects: ["cup"], location_hints: ["café"],
    mood: "welcoming", detected_text: ["Welcome!"], dominant_colors: ["#123456"],
    confidence: 0.9, processing_status: "completed",
  });
  expect(fields).toEqual({ tags: JSON.stringify(["coffee", "cup", "café", "welcoming", "Welcome!"]) });
});
