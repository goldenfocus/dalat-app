import { describe, it, expect } from "vitest";
import { readMusicImportPreference } from "./playlist-import";

describe("playlist reuse", () => {
  it("defaults off for missing or malformed account preferences", () => {
    expect(readMusicImportPreference(null).enabled).toBe(false);
    expect(readMusicImportPreference({ enabled: "true", sourcePlaylistId: 123 })).toEqual({ enabled: false, sourcePlaylistId: "", trackIds: null });
  });
  it("preserves individual-track preferences", () => {
    expect(readMusicImportPreference({ enabled: true, sourcePlaylistId: "source", trackIds: ["track"] }).trackIds).toEqual(["track"]);
  });
  it("restores an explicit opt in and supports turning it off", () => {
    expect(readMusicImportPreference({ enabled: true, sourcePlaylistId: "source" })).toEqual({ enabled: true, sourcePlaylistId: "source", trackIds: null });
    expect(readMusicImportPreference({ enabled: false, sourcePlaylistId: "source" }).enabled).toBe(false);
  });
});
