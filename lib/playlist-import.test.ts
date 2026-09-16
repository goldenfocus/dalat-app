import { describe, it, expect } from "vitest";
import { copyPlaylistTrack, readMusicImportPreference } from "./playlist-import";

describe("playlist reuse", () => {
  it("creates independent ordered tracks while preserving playback and lyrics", () => {
    expect(copyPlaylistTrack({ id: "old", playlist_id: "source", created_at: "yesterday", file_url: "https://media.test/song.mp3", title: "Song", lyrics_lrc: "[00:01]Hello", timing_offset: -100, sort_order: 17 }, "new", 0))
      .toEqual({ playlist_id: "new", file_url: "https://media.test/song.mp3", title: "Song", lyrics_lrc: "[00:01]Hello", timing_offset: -100, sort_order: 0 });
  });
  it("defaults off for missing or malformed account preferences", () => {
    expect(readMusicImportPreference(null).enabled).toBe(false);
    expect(readMusicImportPreference({ enabled: "true", sourcePlaylistId: 123 })).toEqual({ enabled: false, sourcePlaylistId: "", trackIds: null });
  });
  it("restores an explicit opt in and supports turning it off", () => {
    expect(readMusicImportPreference({ enabled: true, sourcePlaylistId: "source" })).toEqual({ enabled: true, sourcePlaylistId: "source", trackIds: null });
    expect(readMusicImportPreference({ enabled: false, sourcePlaylistId: "source" }).enabled).toBe(false);
  });
});
