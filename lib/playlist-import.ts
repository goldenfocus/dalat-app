export interface MusicImportSelection {
  enabled: boolean;
  sourcePlaylistId: string;
  trackIds: string[] | null; // null means the full playlist
}

export const MUSIC_IMPORT_PREFERENCE = "event_music_import";
export const emptyMusicImport: MusicImportSelection = {
  enabled: false, sourcePlaylistId: "", trackIds: null,
};

export function readMusicImportPreference(value: unknown): MusicImportSelection {
  if (!value || typeof value !== "object") return emptyMusicImport;
  const preference = value as Record<string, unknown>;
  return {
    enabled: preference.enabled === true,
    sourcePlaylistId: typeof preference.sourcePlaylistId === "string" ? preference.sourcePlaylistId : "",
    trackIds: Array.isArray(preference.trackIds) && preference.trackIds.every(id => typeof id === "string") ? preference.trackIds : null,
  };
}

// Explicit allowlist: a copy has its own identity and retains playable media and lyrics.
export function copyPlaylistTrack(track: Record<string, unknown>, playlistId: string, index: number) {
  const fields = ["file_url", "file_size_bytes", "title", "artist", "album", "thumbnail_url",
    "duration_seconds", "track_number", "release_year", "genre", "lyrics_lrc", "timing_offset", "seo_keywords"];
  return Object.fromEntries([
    ...fields.filter((field) => track[field] !== undefined).map((field) => [field, track[field]]),
    ["playlist_id", playlistId], ["sort_order", index],
  ]);
}
