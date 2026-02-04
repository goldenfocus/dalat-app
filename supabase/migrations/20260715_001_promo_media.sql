-- ============================================
-- PROMO MEDIA SYSTEM
-- Promotional content for events and series
-- ============================================

-- ============================================
-- 1. PROMO MEDIA TABLE
-- ============================================

CREATE TABLE promo_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership: ONE of these must be set (series OR event, not both)
  series_id UUID REFERENCES event_series ON DELETE CASCADE,
  event_id UUID REFERENCES events ON DELETE CASCADE,

  -- Content type
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'youtube', 'pdf')),

  -- For uploaded files (images, videos, PDFs)
  media_url TEXT,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size INT,
  mime_type TEXT,

  -- For YouTube embeds
  youtube_url TEXT,
  youtube_video_id TEXT,

  -- Import from moments (no storage duplication)
  -- When set, we use the moment's media_url instead
  source_moment_id UUID REFERENCES moments(id) ON DELETE SET NULL,

  -- Display metadata
  title TEXT,
  caption TEXT,
  sort_order INT DEFAULT 0,

  -- AI auto-selection marker
  is_ai_suggested BOOLEAN DEFAULT false,

  -- Audit
  created_by UUID REFERENCES profiles ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT promo_owner_check CHECK (
    (series_id IS NOT NULL AND event_id IS NULL) OR
    (series_id IS NULL AND event_id IS NOT NULL)
  ),
  CONSTRAINT promo_source_check CHECK (
    media_url IS NOT NULL OR
    youtube_url IS NOT NULL OR
    source_moment_id IS NOT NULL
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_promo_media_series ON promo_media(series_id, sort_order)
  WHERE series_id IS NOT NULL;
CREATE INDEX idx_promo_media_event ON promo_media(event_id, sort_order)
  WHERE event_id IS NOT NULL;
CREATE INDEX idx_promo_media_moment ON promo_media(source_moment_id)
  WHERE source_moment_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER set_promo_media_updated_at
  BEFORE UPDATE ON promo_media
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE promo_media IS 'Promotional media for events and series (images, videos, YouTube, PDFs)';
COMMENT ON COLUMN promo_media.source_moment_id IS 'Reference to imported moment - uses moment media_url without duplicating storage';


-- ============================================
-- 2. ADD PROMO OVERRIDE FLAG TO EVENTS
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS has_promo_override BOOLEAN DEFAULT false;

CREATE INDEX idx_events_promo_override ON events(series_id, has_promo_override)
  WHERE series_id IS NOT NULL;

COMMENT ON COLUMN events.has_promo_override IS 'When true, event uses its own promo_media instead of inheriting from series';


-- ============================================
-- 3. RLS POLICIES
-- ============================================

ALTER TABLE promo_media ENABLE ROW LEVEL SECURITY;

-- Anyone can view published promo
CREATE POLICY "promo_media_select_public"
ON promo_media FOR SELECT
USING (true);

-- Series owners can manage series promo
CREATE POLICY "promo_media_series_owner"
ON promo_media FOR ALL
USING (
  series_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM event_series es
    WHERE es.id = promo_media.series_id
    AND es.created_by = auth.uid()
  )
)
WITH CHECK (
  series_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM event_series es
    WHERE es.id = promo_media.series_id
    AND es.created_by = auth.uid()
  )
);

-- Event owners can manage event promo
CREATE POLICY "promo_media_event_owner"
ON promo_media FOR ALL
USING (
  event_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = promo_media.event_id
    AND e.created_by = auth.uid()
  )
)
WITH CHECK (
  event_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = promo_media.event_id
    AND e.created_by = auth.uid()
  )
);

-- Admins/moderators can manage all promo
CREATE POLICY "promo_media_admin"
ON promo_media FOR ALL
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin'))
);


-- ============================================
-- 4. RPC: GET PROMO WITH INHERITANCE
-- ============================================

CREATE OR REPLACE FUNCTION get_event_promo_media(p_event_id UUID)
RETURNS TABLE (
  id UUID,
  media_type TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  youtube_url TEXT,
  youtube_video_id TEXT,
  source_moment_id UUID,
  title TEXT,
  caption TEXT,
  sort_order INT,
  is_ai_suggested BOOLEAN,
  promo_source TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_id UUID;
  v_has_override BOOLEAN;
BEGIN
  -- Get event's series info and override status
  SELECT e.series_id, e.has_promo_override
  INTO v_series_id, v_has_override
  FROM events e
  WHERE e.id = p_event_id;

  -- Case 1: Event has its own promo (override)
  IF v_has_override THEN
    RETURN QUERY
    SELECT
      pm.id,
      pm.media_type,
      COALESCE(pm.media_url, m.media_url) as media_url,
      COALESCE(pm.thumbnail_url, m.thumbnail_url) as thumbnail_url,
      pm.youtube_url,
      pm.youtube_video_id,
      pm.source_moment_id,
      pm.title,
      pm.caption,
      pm.sort_order,
      pm.is_ai_suggested,
      'event'::TEXT as promo_source,
      pm.created_at
    FROM promo_media pm
    LEFT JOIN moments m ON pm.source_moment_id = m.id
    WHERE pm.event_id = p_event_id
    ORDER BY pm.sort_order;
    RETURN;
  END IF;

  -- Case 2: Event belongs to series, inherit series promo
  IF v_series_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      pm.id,
      pm.media_type,
      COALESCE(pm.media_url, m.media_url) as media_url,
      COALESCE(pm.thumbnail_url, m.thumbnail_url) as thumbnail_url,
      pm.youtube_url,
      pm.youtube_video_id,
      pm.source_moment_id,
      pm.title,
      pm.caption,
      pm.sort_order,
      pm.is_ai_suggested,
      'series'::TEXT as promo_source,
      pm.created_at
    FROM promo_media pm
    LEFT JOIN moments m ON pm.source_moment_id = m.id
    WHERE pm.series_id = v_series_id
    ORDER BY pm.sort_order;
    RETURN;
  END IF;

  -- Case 3: Standalone event with event-level promo
  RETURN QUERY
  SELECT
    pm.id,
    pm.media_type,
    COALESCE(pm.media_url, m.media_url) as media_url,
    COALESCE(pm.thumbnail_url, m.thumbnail_url) as thumbnail_url,
    pm.youtube_url,
    pm.youtube_video_id,
    pm.source_moment_id,
    pm.title,
    pm.caption,
    pm.sort_order,
    pm.is_ai_suggested,
    'event'::TEXT as promo_source,
    pm.created_at
  FROM promo_media pm
  LEFT JOIN moments m ON pm.source_moment_id = m.id
  WHERE pm.event_id = p_event_id
  ORDER BY pm.sort_order;
END;
$$;

COMMENT ON FUNCTION get_event_promo_media IS 'Get promo media for an event with fallback to series promo';


-- ============================================
-- 5. RPC: GET SERIES PROMO (DIRECT)
-- ============================================

CREATE OR REPLACE FUNCTION get_series_promo_media(p_series_id UUID)
RETURNS TABLE (
  id UUID,
  media_type TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  youtube_url TEXT,
  youtube_video_id TEXT,
  source_moment_id UUID,
  title TEXT,
  caption TEXT,
  sort_order INT,
  is_ai_suggested BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pm.id,
    pm.media_type,
    COALESCE(pm.media_url, m.media_url) as media_url,
    COALESCE(pm.thumbnail_url, m.thumbnail_url) as thumbnail_url,
    pm.youtube_url,
    pm.youtube_video_id,
    pm.source_moment_id,
    pm.title,
    pm.caption,
    pm.sort_order,
    pm.is_ai_suggested,
    pm.created_at
  FROM promo_media pm
  LEFT JOIN moments m ON pm.source_moment_id = m.id
  WHERE pm.series_id = p_series_id
  ORDER BY pm.sort_order;
$$;


-- ============================================
-- 6. RPC: AI SUGGESTED PROMO FROM PAST EVENTS
-- ============================================

CREATE OR REPLACE FUNCTION get_ai_suggested_promo(p_series_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  moment_id UUID,
  event_id UUID,
  event_slug TEXT,
  event_title TEXT,
  event_starts_at TIMESTAMPTZ,
  media_url TEXT,
  thumbnail_url TEXT,
  content_type TEXT,
  quality_score FLOAT,
  ai_description TEXT,
  mood TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id as moment_id,
    m.event_id,
    e.slug as event_slug,
    e.title as event_title,
    e.starts_at as event_starts_at,
    m.media_url,
    COALESCE(m.thumbnail_url, m.media_url) as thumbnail_url,
    m.content_type,
    mm.quality_score,
    mm.ai_description,
    mm.mood
  FROM moments m
  JOIN events e ON m.event_id = e.id
  LEFT JOIN moment_metadata mm ON m.id = mm.moment_id
  WHERE e.series_id = p_series_id
    AND e.starts_at < now()  -- Past events only
    AND m.status = 'published'
    AND m.content_type IN ('photo', 'image', 'video')
    AND mm.quality_score IS NOT NULL
  ORDER BY
    mm.quality_score DESC NULLS LAST,
    m.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_ai_suggested_promo IS 'Get AI-suggested moments from past events for promotional use';


-- ============================================
-- 7. RPC: IMPORT MOMENT AS PROMO
-- ============================================

CREATE OR REPLACE FUNCTION import_moment_as_promo(
  p_moment_id UUID,
  p_target_series_id UUID DEFAULT NULL,
  p_target_event_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_caption TEXT DEFAULT NULL,
  p_sort_order INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moment RECORD;
  v_promo_id UUID;
  v_media_type TEXT;
BEGIN
  -- Validate: exactly one target must be set
  IF (p_target_series_id IS NULL AND p_target_event_id IS NULL) OR
     (p_target_series_id IS NOT NULL AND p_target_event_id IS NOT NULL) THEN
    RAISE EXCEPTION 'exactly_one_target_required';
  END IF;

  -- Get moment details
  SELECT * INTO v_moment FROM moments WHERE id = p_moment_id AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moment_not_found_or_not_published';
  END IF;

  -- Map moment content_type to promo media_type
  v_media_type := CASE v_moment.content_type
    WHEN 'photo' THEN 'image'
    WHEN 'image' THEN 'image'
    WHEN 'video' THEN 'video'
    WHEN 'youtube' THEN 'youtube'
    WHEN 'pdf' THEN 'pdf'
    ELSE 'image'
  END;

  -- Create promo_media referencing the moment (no file duplication)
  INSERT INTO promo_media (
    series_id,
    event_id,
    media_type,
    source_moment_id,
    youtube_url,
    youtube_video_id,
    title,
    caption,
    sort_order,
    created_by
  )
  VALUES (
    p_target_series_id,
    p_target_event_id,
    v_media_type,
    p_moment_id,
    v_moment.youtube_url,
    v_moment.youtube_video_id,
    COALESCE(p_title, v_moment.title),
    COALESCE(p_caption, v_moment.text_content),
    p_sort_order,
    auth.uid()
  )
  RETURNING id INTO v_promo_id;

  RETURN v_promo_id;
END;
$$;

COMMENT ON FUNCTION import_moment_as_promo IS 'Import a moment as promotional media without duplicating storage';


-- ============================================
-- 8. STORAGE BUCKET FOR PROMO UPLOADS
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'promo-media',
  'promo-media',
  true,
  104857600,  -- 100MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "promo_media_storage_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'promo-media');

CREATE POLICY "promo_media_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'promo-media' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "promo_media_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'promo-media' AND
  auth.uid() IS NOT NULL
);


-- ============================================
-- 9. GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION get_event_promo_media(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_series_promo_media(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ai_suggested_promo(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION import_moment_as_promo(UUID, UUID, UUID, TEXT, TEXT, INT) TO authenticated;
