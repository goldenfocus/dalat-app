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
