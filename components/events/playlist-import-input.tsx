"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_IMPORT_PREFERENCE, readMusicImportPreference, type MusicImportSelection } from "@/lib/playlist-import";

interface PastPlaylist {
  id: string;
  title: string | null;
  events: { title: string; starts_at: string };
  playlist_tracks: { id: string; title: string | null; sort_order: number }[];
}

export function PlaylistImportInput({ value, onChange, userId, disabled = false, eventId, onImported }: {
  value: MusicImportSelection;
  onChange: (value: MusicImportSelection) => void;
  userId: string;
  disabled?: boolean;
  eventId?: string;
  onImported?: () => void;
}) {
  const t = useTranslations("playlist");
  const [playlists, setPlaylists] = useState<PastPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      createClient().auth.getUser(),
      fetch(eventId ? `/api/playlists/import?eventId=${encodeURIComponent(eventId)}` : "/api/playlists/import").then(async response => {
        if (!response.ok) throw new Error("Could not load playlists");
        return response.json();
      }),
    ]).then(([auth, result]) => {
      if (!active) return;
      const available = (result.playlists as PastPlaylist[]).filter(p => p.playlist_tracks.length > 0)
        .sort((a, b) => b.events.starts_at.localeCompare(a.events.starts_at));
      setPlaylists(available);
      // Only apply the preference to the account whose event form is open.
      if (!eventId && auth.data.user?.id === userId) {
        const preference = readMusicImportPreference(auth.data.user.user_metadata[MUSIC_IMPORT_PREFERENCE]);
        onChange({ ...preference, sourcePlaylistId: available.some(p => p.id === preference.sourcePlaylistId) ? preference.sourcePlaylistId : "" });
      }
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, onChange, eventId]);

  const selected = playlists.find(playlist => playlist.id === value.sourcePlaylistId);
  const importToEvent = async () => {
    if (!eventId || !value.sourcePlaylistId || value.trackIds?.length === 0) return;
    setImporting(true);
    setImportError(false);
    setImportResult(null);
    try {
      const response = await fetch("/api/playlists/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, sourcePlaylistId: value.sourcePlaylistId, trackIds: value.trackIds }),
      });
      if (!response.ok) throw new Error("Import failed");
      const result = await response.json();
      setImportResult(t("importComplete", { count: result.count, skipped: result.skipped ?? 0 }));
      onImported?.();
    } catch {
      setImportError(true);
    } finally {
      setImporting(false);
    }
  };
  return <fieldset disabled={disabled || loading || importing} className="space-y-3 border-t pt-4">
    {eventId ? <p className="text-sm font-medium">{t("importPastMusic")}</p> : <label className="flex items-start gap-3 text-sm font-medium">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={value.enabled}
        onChange={e => onChange({ ...value, enabled: e.target.checked })} />
      <span>{t("importPastMusic")}<span className="block text-xs font-normal text-muted-foreground mt-1">{t("importRemember")}</span></span>
    </label>}
    {eventId && <p className="text-xs text-muted-foreground">{t("importAppendHint")}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("importLoading")}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t("importLoadError")}</p>}
    {(value.enabled || eventId) && !loading && <div className="space-y-3">
      {!playlists.length ? <p className="text-sm text-muted-foreground">{t("importEmpty")}</p> : <>
        <label className="block text-sm">{t("importSource")}
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={value.sourcePlaylistId}
            required={!eventId} onChange={e => onChange({ ...value, sourcePlaylistId: e.target.value, trackIds: null })}>
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
          {eventId && <Button type="button" onClick={importToEvent} disabled={importing || value.trackIds?.length === 0}>
            {t(importing ? "importInProgress" : "importNow")}
          </Button>}
        </>}
      </>}
    </div>}
    {importResult && <p role="status" className="text-sm">{importResult}</p>}
    {importError && <p role="alert" className="text-sm text-destructive">{t("importRetryError")}</p>}
  </fieldset>;
}
