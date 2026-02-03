-- ============================================
-- EVENT PLAYLISTS
-- Migration: 20260613_001_event_playlists
-- ============================================
-- Adds playlist support for events. Each event can have one playlist
-- containing audio tracks with ID3 metadata for rich display.
--
-- Features:
-- - Background/lock-screen playback via Media Session API
-- - Shareable playlist pages with OG image previews
-- - Auto-extracted ID3 metadata from uploaded MP3s

-- ============================================
-- TABLES
-- ============================================

-- event_playlists: One playlist per event (for now)
CREATE TABLE event_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events ON DELETE CASCADE NOT NULL,
  title text, -- Optional custom title, defaults to event title
  description text, -- Optional description for SEO
  created_by uuid REFERENCES profiles NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One playlist per event (remove this constraint to allow multiple)
  UNIQUE(event_id)
);

CREATE INDEX idx_event_playlists_event ON event_playlists(event_id);

COMMENT ON TABLE event_playlists IS 'Audio playlists attached to events. Currently one per event.';

-- playlist_tracks: Individual tracks within a playlist
CREATE TABLE playlist_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid REFERENCES event_playlists ON DELETE CASCADE NOT NULL,

  -- File storage
  file_url text NOT NULL,
  file_size_bytes bigint,

  -- ID3 metadata (extracted from audio file)
  title text, -- Song title (ID3 TIT2)
  artist text, -- Artist name (ID3 TPE1)
  album text, -- Album name (ID3 TALB)
  thumbnail_url text, -- Album art (extracted and stored)
  duration_seconds integer, -- Audio duration
  track_number text, -- Track number, may include total like "3/12" (ID3 TRCK)
  release_year integer, -- Release year (ID3 TYER/TDRC)
  genre text, -- Genre (ID3 TCON)

  -- Ordering
  sort_order integer NOT NULL DEFAULT 0,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_sort ON playlist_tracks(playlist_id, sort_order);

COMMENT ON TABLE playlist_tracks IS 'Audio tracks within a playlist with ID3 metadata.';
COMMENT ON COLUMN playlist_tracks.title IS 'Track title from ID3 TIT2 tag';
COMMENT ON COLUMN playlist_tracks.artist IS 'Artist name from ID3 TPE1 tag';
COMMENT ON COLUMN playlist_tracks.album IS 'Album name from ID3 TALB tag';
COMMENT ON COLUMN playlist_tracks.thumbnail_url IS 'Album art URL, extracted from ID3 APIC tag';
COMMENT ON COLUMN playlist_tracks.duration_seconds IS 'Audio duration in seconds';
COMMENT ON COLUMN playlist_tracks.track_number IS 'Track number from ID3 TRCK tag';

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE TRIGGER event_playlists_updated_at BEFORE UPDATE ON event_playlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER playlist_tracks_updated_at BEFORE UPDATE ON playlist_tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE event_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Helper: Check if user can manage event's playlist (organizer or admin)
CREATE OR REPLACE FUNCTION can_manage_event_playlist(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id
    AND (
      -- Event organizer
      e.organizer_id = auth.uid()
      -- Or original creator
      OR e.created_by = auth.uid()
      -- Or admin/superadmin
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
      )
    )
  );
$$;

-- EVENT_PLAYLISTS policies

-- Anyone can view playlists for published events
CREATE POLICY "event_playlists_select_public"
ON event_playlists FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = event_playlists.event_id
    AND events.status = 'published'
  )
);

-- Organizers/admins can create playlist
CREATE POLICY "event_playlists_insert_organizer"
ON event_playlists FOR INSERT
WITH CHECK (
  can_manage_event_playlist(event_id)
  AND auth.uid() = created_by
);

-- Organizers/admins can update playlist
CREATE POLICY "event_playlists_update_organizer"
ON event_playlists FOR UPDATE
USING (can_manage_event_playlist(event_id))
WITH CHECK (can_manage_event_playlist(event_id));

-- Organizers/admins can delete playlist
CREATE POLICY "event_playlists_delete_organizer"
ON event_playlists FOR DELETE
USING (can_manage_event_playlist(event_id));

-- PLAYLIST_TRACKS policies

-- Anyone can view tracks for playlists of published events
CREATE POLICY "playlist_tracks_select_public"
ON playlist_tracks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM event_playlists ep
    JOIN events e ON e.id = ep.event_id
    WHERE ep.id = playlist_tracks.playlist_id
    AND e.status = 'published'
  )
);

-- Organizers/admins can add tracks
CREATE POLICY "playlist_tracks_insert_organizer"
ON playlist_tracks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM event_playlists ep
    WHERE ep.id = playlist_tracks.playlist_id
    AND can_manage_event_playlist(ep.event_id)
  )
);

-- Organizers/admins can update tracks
CREATE POLICY "playlist_tracks_update_organizer"
ON playlist_tracks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM event_playlists ep
    WHERE ep.id = playlist_tracks.playlist_id
    AND can_manage_event_playlist(ep.event_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM event_playlists ep
    WHERE ep.id = playlist_tracks.playlist_id
    AND can_manage_event_playlist(ep.event_id)
  )
);

-- Organizers/admins can delete tracks
CREATE POLICY "playlist_tracks_delete_organizer"
ON playlist_tracks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM event_playlists ep
    WHERE ep.id = playlist_tracks.playlist_id
    AND can_manage_event_playlist(ep.event_id)
  )
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get playlist with tracks for an event (used by playlist page)
CREATE OR REPLACE FUNCTION get_event_playlist(p_event_slug text)
RETURNS TABLE (
  playlist_id uuid,
  playlist_title text,
  playlist_description text,
  event_id uuid,
  event_title text,
  event_image_url text,
  event_starts_at timestamptz,
  event_location_name text,
  track_id uuid,
  track_file_url text,
  track_title text,
  track_artist text,
  track_album text,
  track_thumbnail_url text,
  track_duration_seconds integer,
  track_sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ep.id AS playlist_id,
    ep.title AS playlist_title,
    ep.description AS playlist_description,
    e.id AS event_id,
    e.title AS event_title,
    e.image_url AS event_image_url,
    e.starts_at AS event_starts_at,
    e.location_name AS event_location_name,
    pt.id AS track_id,
    pt.file_url AS track_file_url,
    pt.title AS track_title,
    pt.artist AS track_artist,
    pt.album AS track_album,
    pt.thumbnail_url AS track_thumbnail_url,
    pt.duration_seconds AS track_duration_seconds,
    pt.sort_order AS track_sort_order
  FROM events e
  JOIN event_playlists ep ON ep.event_id = e.id
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = ep.id
  WHERE e.slug = p_event_slug
  AND e.status = 'published'
  ORDER BY pt.sort_order ASC, pt.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_event_playlist(text) TO anon, authenticated;

COMMENT ON FUNCTION get_event_playlist IS
'Returns playlist and tracks for an event by slug. Used by the playlist page.';

-- Check if event has a playlist (for showing playlist link on event page)
CREATE OR REPLACE FUNCTION event_has_playlist(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_playlists ep
    JOIN playlist_tracks pt ON pt.playlist_id = ep.id
    WHERE ep.event_id = p_event_id
  );
$$;

GRANT EXECUTE ON FUNCTION event_has_playlist(uuid) TO anon, authenticated;

COMMENT ON FUNCTION event_has_playlist IS
'Returns true if event has a playlist with at least one track.';
