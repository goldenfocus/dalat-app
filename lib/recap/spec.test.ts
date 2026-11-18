import { describe, expect, it } from "vitest";
import { validateRecapSpec, type RecapSpec } from "./spec";

function goodSpec(): RecapSpec {
  const photo = (id: string, startMs: number) => ({
    type: "photo" as const,
    id,
    startMs,
    durationMs: 2500,
    transition: { id: "crossfade", durationMs: 400 },
    caption: null,
    credit: "An",
    aiGenerated: false,
    mediaUrl: `https://cdn.example.com/${id}.jpg`,
    width: 1080,
    height: 1920,
    motion: "zoom-in-center",
    fit: "cover" as const,
  });
  const video = {
    type: "video" as const,
    id: "v1",
    startMs: 10000,
    durationMs: 3000,
    transition: { id: "fade-black", durationMs: 400 },
    caption: { text: "Dance floor", sourceLocale: "en" },
    credit: null,
    aiGenerated: false,
    mediaUrl: null,
    streamUid: "abc123",
    inMs: 500,
    outMs: 3500,
    muted: true,
  };
  return {
    specVersion: 1,
    event: { id: "e1", slug: "night-market", title: "Night Market", localDate: "2026-11-14", venueName: "Chợ Đêm", canonicalUrl: "https://dalat.app/events/night-market" },
    output: { width: 1080, height: 1920, fps: 30, totalDurationMs: 26000 },
    soundtrack: { fileUrl: "https://cdn.example.com/t.mp3", title: "T", artist: null, isHouse: true, startOffsetMs: 0, beatTimesMs: [500, 1000, 1500] },
    titleCard: { startMs: 0, durationMs: 2500, headline: "Night Market", subline: "2026-11-14 · Chợ Đêm" },
    shots: [photo("p1", 2500), photo("p2", 5000), photo("p3", 7500), video, photo("p4", 13000), photo("p5", 15500), photo("p6", 18000), photo("p7", 20500)],
    endCard: { startMs: 23000, durationMs: 3000, headline: "Night Market", subline: null, ctaUrl: "https://dalat.app/events/night-market" },
    seed: "e1",
    disclosures: [],
    sourceHash: "0123456789abcdef",
  };
}

const codes = (input: unknown) => {
  const r = validateRecapSpec(input);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe("validateRecapSpec", () => {
  it("accepts a good spec", () => {
    const r = validateRecapSpec(goodSpec());
    expect(r.ok).toBe(true);
  });

  it("rejects a gap", () => {
    const s = goodSpec();
    s.shots[2].startMs += 100;
    expect(codes(s)).toContain("timeline_gap");
  });

  it("rejects an overlap", () => {
    const s = goodSpec();
    s.shots[2].startMs -= 100;
    expect(codes(s)).toContain("timeline_overlap");
  });

  it("rejects a timeline that does not start at zero", () => {
    const s = goodSpec();
    s.titleCard.startMs = 100;
    expect(codes(s)).toContain("timeline_start");
  });

  it("rejects negative and non-integer timings", () => {
    const neg = goodSpec();
    neg.shots[0].durationMs = -5;
    expect(codes(neg)).toContain("schema");
    const frac = goodSpec();
    frac.shots[0].startMs = 2500.5;
    expect(codes(frac)).toContain("schema");
  });

  it("rejects a total that does not match the blocks", () => {
    const s = goodSpec();
    s.output.totalDurationMs = 27000;
    expect(codes(s)).toContain("total_mismatch");
  });

  it("enforces duration bounds", () => {
    const s = goodSpec();
    s.endCard.durationMs = 20000;
    s.output.totalDurationMs = 43000;
    expect(codes(s)).toContain("duration_out_of_bounds");
  });

  it("rejects bad video ranges and missing sources", () => {
    const s = goodSpec();
    const v = s.shots[3];
    if (v.type !== "video") throw new Error("fixture");
    v.outMs = v.inMs + 1000;
    expect(codes(s)).toContain("bad_video_range");
    v.outMs = v.inMs + v.durationMs;
    v.streamUid = null;
    expect(codes(s)).toContain("missing_video_source");
  });

  it("rejects duplicate ids and too-long transitions", () => {
    const s = goodSpec();
    s.shots[1].id = s.shots[0].id;
    s.shots[0].transition.durationMs = 2000;
    const c = codes(s);
    expect(c).toContain("duplicate_shot_id");
    expect(c).toContain("transition_too_long");
  });

  it("requires AI-generated shots to be disclosed", () => {
    const s = goodSpec();
    s.shots[0].aiGenerated = true;
    expect(codes(s)).toContain("disclosure_missing");
    s.disclosures = [{ kind: "ai_generated_media", shotIds: ["p1"] }];
    expect(validateRecapSpec(s).ok).toBe(true);
    s.disclosures = [{ kind: "ai_generated_media", shotIds: ["p1", "nope"] }];
    expect(codes(s)).toContain("disclosure_unknown_shot");
  });

  it("requires https media and non-increasing beats are rejected", () => {
    const s = goodSpec();
    if (s.shots[0].type === "photo") s.shots[0].mediaUrl = "http://x.example.com/a.jpg";
    expect(codes(s)).toContain("schema");
    const b = goodSpec();
    b.soundtrack!.beatTimesMs = [500, 500];
    expect(codes(b)).toContain("beats_not_increasing");
  });

  it("does not throw on garbage", () => {
    expect(validateRecapSpec(null).ok).toBe(false);
    expect(validateRecapSpec({}).ok).toBe(false);
  });
});
