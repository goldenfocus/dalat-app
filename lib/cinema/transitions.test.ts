import { describe, expect, it } from "vitest";
import { CINEMA_TRANSITIONS, selectTransition } from "./transitions";

describe("selectTransition", () => {
  it("keeps the content-type rules", () => {
    expect(selectTransition("video", "photo", "s", "m", 0).id).toBe("fade-black");
    expect(selectTransition("photo", "video", "s", "m", 0).id).toBe("zoom-blur");
    expect(selectTransition("video", "video", "s", "m", 0).id).toBe("crossfade");
  });

  it("is deterministic and mixes in slide-push for ~10% of photo pairs", () => {
    const run = () =>
      Array.from({ length: 1000 }, (_, i) =>
        selectTransition("photo", "photo", "evt", `m${i}`, i).id,
      );
    expect(run()).toEqual(run());
    const pushes = run().filter((id) => id === "slide-push").length;
    expect(pushes).toBeGreaterThan(50);
    expect(pushes).toBeLessThan(160);
  });

  it("catalogue ids match their keys and have positive durations", () => {
    for (const [key, t] of Object.entries(CINEMA_TRANSITIONS)) {
      expect(t.id).toBe(key);
      expect(t.durationMs).toBeGreaterThan(0);
    }
  });
});
