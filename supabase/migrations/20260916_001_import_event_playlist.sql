-- Atomic, retry-safe music reuse for new and existing events.
-- The target event row serializes imports; existing tracks and playlist details stay intact.
CREATE OR REPLACE FUNCTION public.import_event_playlist(
  p_event_id uuid,
  p_source_playlist_id uuid,
  p_track_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_source event_playlists%ROWTYPE;
  v_playlist_id uuid;
  v_offset integer;
  v_selected integer;
  v_added integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT created_by INTO v_owner FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target event not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT can_manage_event_playlist(p_event_id) OR (
    v_owner <> v_user AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = v_user AND role IN ('admin', 'superadmin')
    )
  ) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;

  SELECT ep.* INTO v_source FROM event_playlists ep JOIN events e ON e.id = ep.event_id
  WHERE ep.id = p_source_playlist_id AND e.created_by = v_owner
    AND e.starts_at < now() AND e.status = 'published' AND e.id <> p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source playlist is unavailable for this host' USING ERRCODE = 'P0002'; END IF;
  IF p_track_ids IS NOT NULL AND (
    cardinality(p_track_ids) = 0 OR cardinality(p_track_ids) > 500 OR EXISTS (
      SELECT 1 FROM unnest(p_track_ids) selected(id)
      WHERE NOT EXISTS (SELECT 1 FROM playlist_tracks pt WHERE pt.playlist_id = p_source_playlist_id AND pt.id = selected.id)
    )
  ) THEN RAISE EXCEPTION 'Invalid track selection' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_selected FROM playlist_tracks
    WHERE playlist_id = p_source_playlist_id AND (p_track_ids IS NULL OR id = ANY(p_track_ids));
  IF v_selected = 0 THEN RAISE EXCEPTION 'Source playlist is empty' USING ERRCODE = '22023'; END IF;

  INSERT INTO event_playlists(event_id, created_by, title, description)
    VALUES (p_event_id, v_user, v_source.title, v_source.description)
    ON CONFLICT (event_id) DO NOTHING;
  SELECT id INTO v_playlist_id FROM event_playlists WHERE event_id = p_event_id;
  SELECT coalesce(max(sort_order) + 1, 0) INTO v_offset FROM playlist_tracks WHERE playlist_id = v_playlist_id;

  INSERT INTO playlist_tracks(playlist_id, file_url, file_size_bytes, title, artist, album,
    thumbnail_url, duration_seconds, track_number, release_year, genre, lyrics_lrc,
    timing_offset, seo_keywords, sort_order)
  SELECT v_playlist_id, t.file_url, t.file_size_bytes, t.title, t.artist, t.album,
    t.thumbnail_url, t.duration_seconds, t.track_number, t.release_year, t.genre,
    t.lyrics_lrc, t.timing_offset, t.seo_keywords,
    v_offset + (row_number() OVER (ORDER BY t.sort_order, t.created_at, t.id) - 1)::integer
  FROM (
    SELECT DISTINCT ON (pt.file_url) pt.* FROM playlist_tracks pt
    WHERE pt.playlist_id = p_source_playlist_id
      AND (p_track_ids IS NULL OR pt.id = ANY(p_track_ids))
      AND NOT EXISTS (SELECT 1 FROM playlist_tracks existing WHERE existing.playlist_id = v_playlist_id AND existing.file_url = pt.file_url)
    ORDER BY pt.file_url, pt.sort_order, pt.created_at, pt.id
  ) t;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('playlistId', v_playlist_id, 'count', v_added, 'skipped', v_selected - v_added);
END;
$$;
REVOKE ALL ON FUNCTION public.import_event_playlist(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_event_playlist(uuid, uuid, uuid[]) TO authenticated;
