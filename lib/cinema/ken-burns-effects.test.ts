import { describe, expect, it } from "vitest";
import {
  COVER_MAX_MISMATCH,
  KEN_BURNS_DURATION_MS,
  KEN_BURNS_EFFECTS,
  createEffectScheduler,
  generateEffectSequence,
  getPhotoFit,
  getStaticEffect,
  isStaticEffect,
  selectNextEffect,
} from "./ken-burns-effects";

describe("KEN_BURNS_EFFECTS", () => {
  it("has unique names and only transform-based presets", () => {
    const names = KEN_BURNS_EFFECTS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of KEN_BURNS_EFFECTS) {
      expect(e.startTransform).toMatch(/^(scale|translate)/);
      expect(e.endTransform).not.toBe(e.startTransform);
    }
  });

  it("uses a run time longer than the longest slide", () => {
    expect(KEN_BURNS_DURATION_MS).toBeGreaterThanOrEqual(9000);
  });
});

describe("selectNextEffect", () => {
  it("never repeats within the last four effects", () => {
    let state = createEffectScheduler();
    const picked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const r = selectNextEffect(state, i % 3 === 0);
      expect(picked.slice(-4)).not.toContain(r.effect.name);
      picked.push(r.effect.name);
      state = r.newState;
    }
  });

  it("keeps at most four names of history", () => {
    let state = createEffectScheduler();
    for (let i = 0; i < 10; i++) state = selectNextEffect(state).newState;
    expect(state.recentEffects).toHaveLength(4);
  });

  it("prefers vertical-friendly moves for portrait photos", () => {
    for (let i = 0; i < 30; i++) {
      const { effect } = selectNextEffect(createEffectScheduler(), true);
      expect(effect.name).not.toMatch(/pan-(left|right)|drift/);
    }
  });

  it("generateEffectSequence returns one effect per slide", () => {
    expect(generateEffectSequence(7, new Set([1, 2]))).toHaveLength(7);
  });
});

describe("static effect (reduced motion)", () => {
  it("is recognised as no motion", () => {
    expect(isStaticEffect(getStaticEffect())).toBe(true);
    expect(isStaticEffect(null)).toBe(true);
    expect(isStaticEffect(KEN_BURNS_EFFECTS[0])).toBe(false);
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
