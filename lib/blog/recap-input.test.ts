import { describe, it, expect } from "vitest";
import {
  selectRecapMoments,
  buildRecapPrompt,
  parseRecapOutput,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "./recap-input";

const completedMoment = (over: Partial<RecapMomentRow> = {}): RecapMomentRow => ({
  content_type: "photo",
  processing_status: "completed",
  ai_description: "A crowd of laptops under warm cafe light",
  ai_title: "Demo time",
  scene_description: "Indoor cafe, projector screen",
  mood: "energetic",
  detected_objects: ["laptop", "projector"],
  ai_tags: ["tech", "meetup"],
  video_summary: null,
  audio_summary: null,
  ...over,
});

describe("selectRecapMoments — the privacy fence", () => {
  it("keeps only completed moments with a non-null ai_description", () => {
    const rows = [
      completedMoment(),
      completedMoment({ processing_status: "skipped", ai_description: null }),
      completedMoment({ processing_status: "pending" }),
      completedMoment({ ai_description: null }),
    ];
    expect(selectRecapMoments(rows)).toHaveLength(1);
  });

  it("excludes privacy-skipped moments even if they somehow carry a caption", () => {
    // Belt-and-suspenders: status is the structural predicate, caption presence is not enough.
    const rows = [completedMoment({ processing_status: "skipped" })];
    expect(selectRecapMoments(rows)).toHaveLength(0);
  });
});

describe("buildRecapPrompt — content policy", () => {
  const prompt = buildRecapPrompt({
    event: {
      title: "Đà Lạt Tech Meetup #4",
      description: "Monthly builders night",
      location_name: "Cafe X",
      starts_at: "2026-07-21T19:00:00Z",
      ends_at: null,
      ai_tags: ["tech"],
    },
    moments: [completedMoment()],
    venueName: "Cafe X",
    organizerName: "Golden Focus",
    momentCount: 5,
    photoCount: 4,
    videoCount: 1,
  });

  it("never contains a detected_text section", () => {
    expect(prompt).not.toMatch(/Text found:/);
    expect(prompt).not.toMatch(/detected_text/);
  });

  it("never instructs the model to name people", () => {
    expect(prompt.toLowerCase()).not.toContain("specific people");
    expect(prompt.toLowerCase()).not.toContain("performers if");
  });

  it("never asks for technical_content", () => {
    expect(prompt).not.toContain("technical_content");
  });

  it("includes the moment descriptions and event facts", () => {
    expect(prompt).toContain("A crowd of laptops under warm cafe light");
    expect(prompt).toContain("Đà Lạt Tech Meetup #4");
  });
});

describe("parseRecapOutput", () => {
  const valid = {
    story_content: "What a night in Đà Lạt...",
    meta_description: "A recap of the Đà Lạt tech meetup",
    seo_keywords: ["dalat", "tech meetup"],
    social_share_text: "We built things!",
    suggested_cta_text: "See the photos",
  };

  it("parses clean JSON", () => {
    expect(parseRecapOutput(JSON.stringify(valid)).story_content).toContain("Đà Lạt");
  });

  it("parses JSON wrapped in fences/prose", () => {
    const out = parseRecapOutput("Here you go:\n```json\n" + JSON.stringify(valid) + "\n```");
    expect(out.meta_description).toBe(valid.meta_description);
  });

  it("throws on missing required fields", () => {
    const { story_content: _drop, ...bad } = valid;
    expect(() => parseRecapOutput(JSON.stringify(bad))).toThrow();
  });

  it("throws on empty story", () => {
    expect(() => parseRecapOutput(JSON.stringify({ ...valid, story_content: " " }))).toThrow();
  });
});

describe("RECAP_PROMPT_VERSION", () => {
  it("is stamped so re-runs become a WHERE clause", () => {
    expect(RECAP_PROMPT_VERSION).toMatch(/^recap-v\d+$/);
  });
});
