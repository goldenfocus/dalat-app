import { describe, expect, it } from "vitest";
import {
  COVER_MAX_MISMATCH,
  KEN_BURNS_DURATION_MS,
  CINEMA_MOTION_PRESETS,
  KEN_BURNS_PRESETS,
  STATIC_PRESET_ID,
  getPhotoFit,
  isStaticEffect,
  kenBurnsCssVars,
  kenBurnsTransform,
  sampleKenBurns,
  selectKenBurnsPresetId,
} from "./ken-burns-effects";

const seq = (seed: string, n: number, portrait = (_i: number) => false) =>
  Array.from({ length: n }, (_, i) =>
    selectKenBurnsPresetId(seed, `m${i}`, i, portrait(i)),
  );

describe("motion presets", () => {
  it("has unique ids, all resolvable, and real motion except static", () => {
    const ids = KEN_BURNS_PRESETS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of KEN_BURNS_PRESETS) {
      expect(CINEMA_MOTION_PRESETS[e.id]).toBe(e);
      expect(isStaticEffect(e.id)).toBe(false);
      expect([e.scale0, e.x0, e.y0]).not.toEqual([e.scale1, e.x1, e.y1]);
    }
    expect(CINEMA_MOTION_PRESETS[STATIC_PRESET_ID]).toBeDefined();
  });

  it("uses a run time longer than the longest slide", () => {
    expect(KEN_BURNS_DURATION_MS).toBeGreaterThanOrEqual(9000);
  });
});

describe("selectKenBurnsPresetId", () => {
  it("is deterministic for the same seed and differs across seeds", () => {
    expect(seq("evt-a", 40)).toEqual(seq("evt-a", 40));
    expect(seq("evt-a", 40)).not.toEqual(seq("evt-b", 40));
  });

  it("never repeats on consecutive slides, whatever the orientation", () => {
    for (const seed of ["a", "b", "dalat-night-market"]) {
      const ids = seq(seed, 200, (i) => i % 3 === 0);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it("only picks vertical-friendly moves for portrait photos", () => {
    for (const id of seq("p", 100, () => true)) {
      expect(id).not.toMatch(/pan-(left|right)|drift/);
    }
  });

  it("uses landscape moves too, and only known ids", () => {
    const ids = new Set(seq("land", 200));
    expect([...ids].some((id) => /pan-(left|right)|drift/.test(id))).toBe(true);
    for (const id of ids) expect(CINEMA_MOTION_PRESETS[id]).toBeDefined();
  });
});

describe("sampleKenBurns", () => {
  it("returns preset start and end at the endpoints", () => {
    for (const e of KEN_BURNS_PRESETS) {
      expect(sampleKenBurns(e.id, 0)).toEqual({ scale: e.scale0, x: e.x0, y: e.y0 });
      expect(sampleKenBurns(e.id, 1)).toEqual({ scale: e.scale1, x: e.x1, y: e.y1 });
    }
  });

  it("is linear and clamps out-of-range progress", () => {
    const s = sampleKenBurns("zoom-pan-left", 0.5);
    expect(s.scale).toBeCloseTo(1.15);
    expect(s.x).toBeCloseTo(0);
    expect(sampleKenBurns("zoom-pan-left", -1)).toEqual(sampleKenBurns("zoom-pan-left", 0));
    expect(sampleKenBurns("zoom-pan-left", 9)).toEqual(sampleKenBurns("zoom-pan-left", 1));
  });
});

describe("kenBurnsCssVars", () => {
  it("emits the custom properties the player consumes", () => {
    expect(kenBurnsCssVars("zoom-pan-left")).toEqual({
      "--kb-start": "scale(1.1) translate(5%, 0%)",
      "--kb-end": "scale(1.2) translate(-5%, 0%)",
      transformOrigin: "0% 50%",
    });
    expect(kenBurnsTransform(sampleKenBurns("zoom-in-center", 1))).toBe(
      "scale(1.15) translate(0%, 0%)",
    );
  });
});

describe("static effect (reduced motion)", () => {
  it("is recognised as no motion", () => {
    expect(isStaticEffect(STATIC_PRESET_ID)).toBe(true);
    expect(isStaticEffect(null)).toBe(true);
    expect(isStaticEffect(KEN_BURNS_PRESETS[0].id)).toBe(false);
  });
});

describe("getPhotoFit", () => {
  const desktop = [1920, 1080] as const;
  const phone = [390, 844] as const;

  it("covers when the aspect mismatch is small", () => {
    expect(getPhotoFit(1500, 1000, ...desktop)).toBe("cover"); // 3:2 on 16:9
    expect(getPhotoFit(1200, 900, ...desktop)).toBe("cover"); // 4:3 on 16:9
    expect(getPhotoFit(1080, 1920, ...phone)).toBe("cover"); // 9:16 on phone
  });

  it("contains when covering would crop heavily", () => {
    expect(getPhotoFit(1920, 1080, ...phone)).toBe("contain"); // landscape on phone
    expect(getPhotoFit(1500, 2000, ...phone)).toBe("contain"); // 3:4 on tall phone
    expect(getPhotoFit(1080, 1920, ...desktop)).toBe("contain"); // portrait on desktop
  });

  it("is symmetric around the threshold", () => {
    const wide = Math.round(1000 * COVER_MAX_MISMATCH) - 1;
    expect(getPhotoFit(wide, 1000, 1000, 1000)).toBe("cover");
    expect(getPhotoFit(1000, wide + 20, 1000, 1000)).toBe("contain");
  });

  it("falls back to cover for unknown sizes", () => {
    expect(getPhotoFit(0, 0, 390, 844)).toBe("cover");
    expect(getPhotoFit(100, 100, 0, 0)).toBe("cover");
  });
});
