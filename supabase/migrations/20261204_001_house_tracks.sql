-- House soundtrack library for cinema mode.
-- Events without music of their own fall back to one deterministic house
-- track (see lib/cinema/resolve-soundtrack.ts). The owner loads rows with the
-- service role; the public can only read active tracks. Empty table = no-op.
BEGIN;

CREATE TABLE IF NOT EXISTS public.house_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url text NOT NULL,
  title text,
  artist text,
  thumbnail_url text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  mood text NOT NULL CHECK (mood IN ('chill', 'upbeat', 'acoustic', 'night', 'misty', 'celebration')),
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_url)
);

CREATE INDEX IF NOT EXISTS idx_house_tracks_active_mood ON public.house_tracks (mood) WHERE is_active;

COMMENT ON TABLE public.house_tracks IS 'Owner-curated fallback soundtrack for cinema mode when an event has no music.';

DROP TRIGGER IF EXISTS house_tracks_updated_at ON public.house_tracks;
CREATE TRIGGER house_tracks_updated_at BEFORE UPDATE ON public.house_tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.house_tracks ENABLE ROW LEVEL SECURITY;

-- Public read of active tracks; no client write policies (service role bypasses RLS).
DROP POLICY IF EXISTS "house_tracks_select_active" ON public.house_tracks;
CREATE POLICY "house_tracks_select_active" ON public.house_tracks
  FOR SELECT USING (is_active);

GRANT SELECT ON TABLE public.house_tracks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.house_tracks TO service_role;

COMMIT;
