import { describe, expect, it } from "vitest";
import { buildRecapSpec, snapToBeat, type RecapBuildInput, type RecapMomentInput } from "./build-spec";
import { validateRecapSpec } from "./spec";

const event = { id: "evt-1", slug: "night-market", title: "Night Market", localDate: "2026-11-14", venueName: "Chợ Đêm", canonicalUrl: "https://dalat.app/events/night-market" };

function photo(n: number, extra: Partial<RecapMomentInput> = {}): RecapMomentInput {
  const id = `m${String(n).padStart(3, "0")}`;
  return { id, status: "published", contentType: "photo", mediaUrl: `https://cdn.example.com/${id}.jpg`, caption: null, creditName: "An", createdAt: `2026-11-14T1${n % 10}:00:00Z`, width: 1080, height: 1920, ...extra };
}
function video(n: number, extra: Partial<RecapMomentInput> = {}): RecapMomentInput {
  return photo(n, { contentType: "video", mediaUrl: null, cfVideoUid: `uid${n}`, videoStatus: "ready", videoDurationSeconds: 12, ...extra });
}
const make = (moments: RecapMomentInput[], soundtrack: RecapBuildInput["soundtrack"] = null): RecapBuildInput => ({ event, moments, soundtrack });
const many = (n: number) => Array.from({ length: n }, (_, i) => (i % 4 === 0 ? video(i) : photo(i)));

describe("buildRecapSpec", () => {
  it("builds a valid spec within duration bounds", () => {
    const r = buildRecapSpec(make(many(20)));
    expect(r.spec).not.toBeNull();
    const spec = r.spec!;
    expect(validateRecapSpec(spec).ok).toBe(true);
    expect(spec.output.totalDurationMs).toBeGreaterThanOrEqual(20_000);
    expect(spec.output.totalDurationMs).toBeLessThanOrEqual(40_000);
    expect(spec.shots.length).toBeLessThanOrEqual(12);
    expect(spec.shots.filter((s) => s.type === "video").length).toBeLessThanOrEqual(4);
    expect(spec.titleCard.startMs).toBe(0);
    expect(spec.endCard.ctaUrl).toBe(event.canonicalUrl);
    expect(spec.seed).toBe("evt-1");
  });

  it("stays within bounds for the smallest and an all-video input", () => {
    for (const moments of [many(8).map((_, i) => photo(i)), Array.from({ length: 15 }, (_, i) => video(i))]) {
      const spec = buildRecapSpec(make(moments)).spec!;
      expect(spec.output.totalDurationMs).toBeGreaterThanOrEqual(20_000);
      expect(spec.output.totalDurationMs).toBeLessThanOrEqual(40_000);
    }
  });

  it("is deterministic and independent of input order", () => {
    const input = many(18);
    const a = buildRecapSpec(make(input)).spec;
    const b = buildRecapSpec(make(input)).spec;
    const c = buildRecapSpec(make([...input].reverse())).spec;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("changes selection with the seed but stays valid", () => {
    const input = many(30);
    const a = buildRecapSpec(make(input), { seed: "one" }).spec!;
    const b = buildRecapSpec(make(input), { seed: "two" }).spec!;
    expect(a.shots.map((s) => s.id)).not.toEqual(b.shots.map((s) => s.id));
    expect(validateRecapSpec(b).ok).toBe(true);
  });

  it("gates on minimum eligible moments", () => {
    const r = buildRecapSpec(make(many(7)));
    expect(r.spec).toBeNull();
    expect(r.reason).toEqual({ code: "too_few_moments", eligible: 7, required: 8 });
    expect(buildRecapSpec(make(many(8))).spec).not.toBeNull();
  });

  it("never includes unpublished moments and does not count them toward the gate", () => {
    const hidden = (["draft", "pending", "rejected", "removed"] as const).map((status, i) => photo(100 + i, { status }));
    const r = buildRecapSpec(make([...many(7), ...hidden]));
    expect(r.reason).toMatchObject({ code: "too_few_moments", eligible: 7 });
    const ok = buildRecapSpec(make([...many(20), ...hidden])).spec!;
    const ids = new Set(ok.shots.map((s) => s.id));
    for (const h of hidden) expect(ids.has(h.id)).toBe(false);
    expect(JSON.stringify(ok)).not.toContain(hidden[0].mediaUrl!);
  });

  it("skips moments with missing or unusable media", () => {
    const bad = [
      photo(200, { mediaUrl: null }),
      photo(201, { mediaUrl: "http://insecure.example.com/a.jpg" }),
      video(202, { videoStatus: "processing" }),
      video(203, { videoDurationSeconds: null }),
      photo(204, { contentType: "audio" }),
    ];
    const r = buildRecapSpec(make([...many(7), ...bad]));
    expect(r.reason).toMatchObject({ code: "too_few_moments", eligible: 7 });
  });

  it("clips video excerpts inside the source and keeps tiling", () => {
    const spec = buildRecapSpec(make(many(20))).spec!;
    for (const s of spec.shots) {
      if (s.type === "video") {
        expect(s.outMs - s.inMs).toBe(s.durationMs);
        expect(s.outMs).toBeLessThanOrEqual(12_000);
        expect(s.muted).toBe(true);
      }
    }
  });

  it("prefers engaged and captioned moments when trimming", () => {
    const input = [...many(16), photo(300, { likeCount: 40, caption: "Best night ever" })];
    const spec = buildRecapSpec(make(input), { maxShots: 8 }).spec!;
    const star = spec.shots.find((s) => s.id === "m300");
    expect(star?.caption?.text).toBe("Best night ever");
  });

  it("uses contain-blur for landscape and passes injected pickers through", () => {
    const input = many(10).map((m) => ({ ...m, width: 1920, height: 1080 }));
    const spec = buildRecapSpec(make(input), {
      pickMotion: (_s, _id, i, o) => `m-${i}-${o}`,
      pickTransition: () => ({ id: "t-x", durationMs: 300 }),
    }).spec!;
    const first = spec.shots.find((s) => s.type === "photo");
    expect(first).toMatchObject({ fit: "contain-blur", transition: { id: "t-x", durationMs: 300 } });
    expect(first && first.type === "photo" && first.motion).toMatch(/-landscape$/);
  });

  it("flags AI-generated shots in disclosures", () => {
    const input = many(12).map((m, i) => (i === 1 ? { ...m, aiGenerated: true } : m));
    const spec = buildRecapSpec(make(input), { maxShots: 12 }).spec!;
    const ai = spec.shots.filter((s) => s.aiGenerated).map((s) => s.id);
    expect(spec.disclosures).toEqual(ai.length ? [{ kind: "ai_generated_media", shotIds: ai }] : []);
  });

  it("snaps cuts to beats within tolerance and still tiles", () => {
    const beats = Array.from({ length: 80 }, (_, i) => 300 + i * 500); // 120 bpm grid
    const spec = buildRecapSpec(make(many(10), { fileUrl: "https://cdn.example.com/t.mp3", title: "T", artist: null, isHouse: true, beatTimesMs: beats })).spec!;
    for (const s of spec.shots) expect(beats).toContain(s.startMs);
    expect(validateRecapSpec(spec).ok).toBe(true);
  });

  it("uses fixed durations without beats", () => {
    const spec = buildRecapSpec(make(many(10).map((m) => photo(Number(m.id.slice(1)))))).spec!;
    expect(spec.titleCard.durationMs).toBe(2500);
    expect(spec.shots.every((s) => s.durationMs === 2500)).toBe(true);
  });

  it("accounts for the soundtrack start offset when snapping", () => {
    const beats = Array.from({ length: 80 }, (_, i) => 1000 + 300 + i * 500);
    const spec = buildRecapSpec(make(many(10), { fileUrl: "https://cdn.example.com/t.mp3", title: null, artist: null, isHouse: false, startOffsetMs: 1000, beatTimesMs: beats })).spec!;
    for (const s of spec.shots) expect(beats).toContain(s.startMs + 1000);
  });
});

describe("snapToBeat", () => {
  it("picks the nearest in-range beat within tolerance", () => {
    expect(snapToBeat(2500, [2300, 2650], 250, 2000, 3000)).toBe(2650);
    expect(snapToBeat(2500, [2000], 250, 2000, 3000)).toBe(2500);
    expect(snapToBeat(2500, [2900], 500, 2000, 2800)).toBe(2500);
  });
});

describe("sourceHash", () => {
  it("is stable and sensitive to relevant input", () => {
    const input = many(12);
    const a = buildRecapSpec(make(input)).spec!.sourceHash;
    expect(buildRecapSpec(make([...input].reverse())).spec!.sourceHash).toBe(a);
    const changed = input.map((m, i) => (i === 3 ? { ...m, caption: "new caption" } : m));
    expect(buildRecapSpec(make(changed)).spec!.sourceHash).not.toBe(a);
    expect(buildRecapSpec(make(input), { seed: "other" }).spec!.sourceHash).not.toBe(a);
    expect(buildRecapSpec(make(input), { catalogueVersion: "2" }).spec!.sourceHash).not.toBe(a);
  });

  it("ignores unpublished moments but changes when one is unpublished", () => {
    const input = many(12);
    const a = buildRecapSpec(make(input)).spec!.sourceHash;
    expect(buildRecapSpec(make([...input, photo(400, { status: "pending" })])).spec!.sourceHash).toBe(a);
    const unpublished = input.map((m, i) => (i === 5 ? { ...m, status: "removed" as const } : m));
    expect(buildRecapSpec(make(unpublished)).spec!.sourceHash).not.toBe(a);
  });
});
