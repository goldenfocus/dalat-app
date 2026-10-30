BEGIN;

-- Venue ownership is independent from site roles and check-in staff duties.
CREATE OR REPLACE FUNCTION public.can_edit_venue(p_venue_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (
  EXISTS(SELECT 1 FROM venues WHERE id=p_venue_id AND owner_id=auth.uid()) OR
  EXISTS(SELECT 1 FROM venue_managers WHERE venue_id=p_venue_id AND profile_id=auth.uid()
    AND accepted_at IS NOT NULL AND role IN ('owner','editor'))
 );
$$;
CREATE OR REPLACE FUNCTION public.can_edit_event(p_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM events e WHERE e.id=p_event_id AND (
  e.created_by=auth.uid() OR is_admin() OR
  (can_edit_venue(e.venue_id) AND (e.tribe_id IS NULL OR e.tribe_visibility='public'))
 ));
$$;
CREATE OR REPLACE FUNCTION public.can_edit_series(p_series_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM event_series s WHERE s.id=p_series_id AND (
  s.created_by=auth.uid() OR is_admin() OR
  (can_edit_venue(s.venue_id) AND s.tribe_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.series_id=s.id AND
      (e.venue_id IS DISTINCT FROM s.venue_id OR (e.tribe_id IS NOT NULL AND e.tribe_visibility IS DISTINCT FROM 'public'))
  ))
 ));
$$;
REVOKE ALL ON FUNCTION public.can_edit_venue(uuid), public.can_edit_event(uuid), public.can_edit_series(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_venue(uuid), public.can_edit_event(uuid), public.can_edit_series(uuid) TO authenticated, service_role;

CREATE POLICY venue_editor_events_select ON events FOR SELECT TO authenticated USING(can_edit_event(id));
CREATE POLICY venue_editor_events_update ON events FOR UPDATE TO authenticated USING(can_edit_event(id)) WITH CHECK(can_edit_event(id));
CREATE POLICY venue_editor_events_delete ON events FOR DELETE TO authenticated USING(can_edit_event(id));
CREATE POLICY venue_editor_series_select ON event_series FOR SELECT TO authenticated USING(can_edit_series(id));
CREATE POLICY venue_editor_series_update ON event_series FOR UPDATE TO authenticated USING(can_edit_series(id)) WITH CHECK(can_edit_series(id));
CREATE POLICY venue_editor_series_delete ON event_series FOR DELETE TO authenticated USING(can_edit_series(id));

-- Scope cannot be changed to claim another creator/venue, cross a private
-- community boundary, or acquire admin-only placement privileges.
CREATE OR REPLACE FUNCTION public.guard_venue_editor_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR OLD.created_by=auth.uid() OR is_admin() THEN RETURN NEW; END IF;
 IF (to_jsonb(OLD)->'id') IS DISTINCT FROM (to_jsonb(NEW)->'id') OR
     (to_jsonb(OLD)->'created_by') IS DISTINCT FROM (to_jsonb(NEW)->'created_by') OR
     (to_jsonb(OLD)->'venue_id') IS DISTINCT FROM (to_jsonb(NEW)->'venue_id') OR
     (to_jsonb(OLD)->'series_id') IS DISTINCT FROM (to_jsonb(NEW)->'series_id') OR
     (to_jsonb(OLD)->'tribe_id') IS DISTINCT FROM (to_jsonb(NEW)->'tribe_id') OR
     (to_jsonb(OLD)->'tribe_visibility') IS DISTINCT FROM (to_jsonb(NEW)->'tribe_visibility') OR
     (to_jsonb(OLD)->'sponsor_tier') IS DISTINCT FROM (to_jsonb(NEW)->'sponsor_tier') THEN
   RAISE EXCEPTION 'venue_editor_scope_change_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_venue_editor_event_scope BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION guard_venue_editor_scope();
CREATE TRIGGER guard_venue_editor_series_scope BEFORE UPDATE ON event_series FOR EACH ROW EXECUTE FUNCTION guard_venue_editor_scope();

CREATE POLICY venue_editor_settings ON event_settings FOR ALL TO authenticated USING(can_edit_event(event_id)) WITH CHECK(can_edit_event(event_id));
CREATE POLICY venue_editor_materials ON event_materials FOR ALL TO authenticated USING(can_edit_event(event_id)) WITH CHECK(can_edit_event(event_id));
CREATE POLICY venue_editor_sponsors ON event_sponsors FOR ALL TO authenticated USING(can_edit_event(event_id)) WITH CHECK(can_edit_event(event_id));
CREATE POLICY venue_editor_private_details ON event_private_details FOR ALL TO authenticated USING(can_edit_event(event_id)) WITH CHECK(can_edit_event(event_id));
CREATE POLICY venue_editor_questionnaires ON event_questionnaires FOR ALL TO authenticated USING(can_edit_event(event_id)) WITH CHECK(can_edit_event(event_id));
CREATE POLICY venue_editor_questions ON event_questions FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM event_questionnaires q WHERE q.id=questionnaire_id AND can_edit_event(q.event_id)))
 WITH CHECK(EXISTS(SELECT 1 FROM event_questionnaires q WHERE q.id=questionnaire_id AND can_edit_event(q.event_id)));
CREATE POLICY venue_editor_promo ON promo_media FOR ALL TO authenticated
 USING((event_id IS NOT NULL AND can_edit_event(event_id)) OR (series_id IS NOT NULL AND can_edit_series(series_id)))
 WITH CHECK((event_id IS NOT NULL AND can_edit_event(event_id)) OR (series_id IS NOT NULL AND can_edit_series(series_id)));
CREATE POLICY venue_editor_exceptions ON series_exceptions FOR ALL TO authenticated USING(can_edit_series(series_id)) WITH CHECK(can_edit_series(series_id));

-- Preserve the legacy organizer permission while adding the full-editor scope.
CREATE OR REPLACE FUNCTION public.can_manage_event_playlist(p_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT can_edit_event(p_event_id) OR EXISTS(SELECT 1 FROM events WHERE id=p_event_id AND organizer_id=auth.uid());
$$;
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
  IF NOT can_manage_event_playlist(p_event_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF v_owner <> v_user AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_user AND role IN ('admin','superadmin')) THEN
    IF NOT can_edit_event(p_event_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
    v_owner := v_user;
  END IF;

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

COMMIT;
