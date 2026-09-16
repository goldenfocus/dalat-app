"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_IMPORT_PREFERENCE, readMusicImportPreference, type MusicImportSelection } from "@/lib/playlist-import";

interface PastPlaylist {
  id: string;
  title: string | null;
  events: { title: string; starts_at: string };
  playlist_tracks: { id: string; title: string | null; sort_order: number }[];
}

export function PlaylistImportInput({ value, onChange, userId, disabled = false }: {
  value: MusicImportSelection;
  onChange: (value: MusicImportSelection) => void;
  userId: string;
  disabled?: boolean;
}) {
  const t = useTranslations("playlist");
  const [playlists, setPlaylists] = useState<PastPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      createClient().auth.getUser(),
      fetch("/api/playlists/import").then(async response => {
        if (!response.ok) throw new Error("Could not load playlists");
        return response.json();
      }),
    ]).then(([auth, result]) => {
      if (!active) return;
      const available = (result.playlists as PastPlaylist[]).filter(p => p.playlist_tracks.length > 0)
        .sort((a, b) => b.events.starts_at.localeCompare(a.events.starts_at));
      setPlaylists(available);
      // Only apply the preference to the account whose event form is open.
      if (auth.data.user?.id === userId) {
        const preference = readMusicImportPreference(auth.data.user.user_metadata[MUSIC_IMPORT_PREFERENCE]);
        onChange({ ...preference, sourcePlaylistId: available.some(p => p.id === preference.sourcePlaylistId) ? preference.sourcePlaylistId : "" });
      }
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, onChange]);

  const selected = playlists.find(playlist => playlist.id === value.sourcePlaylistId);
  return <fieldset disabled={disabled || loading} className="space-y-3 border-t pt-4">
    <label className="flex items-start gap-3 text-sm font-medium">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={value.enabled}
        onChange={e => onChange({ ...value, enabled: e.target.checked })} />
      <span>{t("importPastMusic")}<span className="block text-xs font-normal text-muted-foreground mt-1">{t("importRemember")}</span></span>
    </label>
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("importLoading")}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t("importLoadError")}</p>}
    {value.enabled && !loading && <div className="space-y-3">
      {!playlists.length ? <p className="text-sm text-muted-foreground">{t("importEmpty")}</p> : <>
        <label className="block text-sm">{t("importSource")}
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={value.sourcePlaylistId}
            required onChange={e => onChange({ ...value, sourcePlaylistId: e.target.value, trackIds: null })}>
            <option value="">{t("importChoose")}</option>
            {playlists.map(p => <option key={p.id} value={p.id}>{p.events.title} · {p.events.starts_at.slice(0, 10)} ({p.playlist_tracks.length})</option>)}
          </select>
        </label>
        {selected && <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.trackIds === null}
            onChange={e => onChange({ ...value, trackIds: e.target.checked ? null : [] })} />{t("importWholePlaylist")}</label>
          {value.trackIds !== null && <div className="max-h-64 overflow-auto rounded-md border p-3 space-y-2">
            {[...selected.playlist_tracks].sort((a, b) => a.sort_order - b.sort_order).map((track, index) =>
              <label key={track.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.trackIds!.includes(track.id)}
                onChange={e => onChange({ ...value, trackIds: e.target.checked ? [...value.trackIds!, track.id] : value.trackIds!.filter(id => id !== track.id) })} />
                {track.title || `${index + 1}`}</label>)}
          </div>}
          <p className="text-xs text-muted-foreground">{t("importCopyHint")}</p>
        </>}
      </>}
    </div>}
  </fieldset>;
}
