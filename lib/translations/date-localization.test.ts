import { describe, it, expect } from "vitest";
import { formatInDaLatAsync } from "@/lib/timezone";
describe("cold server date localization", () => {
  it("loads German before formatting a venue/event date", async () => {
    expect(await formatInDaLatAsync("2026-01-30T08:00:00Z", "PPP", "de")).toBe("30. Januar 2026");
  });
});
