import { describe, expect, it } from "vitest";
import { getTapZone } from "./use-cinema-input";

describe("getTapZone", () => {
  it("splits the screen into thirds", () => {
    expect(getTapZone(10, 300)).toBe("left");
    expect(getTapZone(150, 300)).toBe("center");
    expect(getTapZone(290, 300)).toBe("right");
  });

  it("treats a zero-width viewport as center", () => {
    expect(getTapZone(0, 0)).toBe("center");
  });
});
