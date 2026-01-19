-- Blog Two-Lanes Enhancement
-- Lane A: Automated daily changelog (cron-driven)
-- Lane B: Human blogging (chat-first, voice-enabled)

-- ============================================
-- 1. ENHANCED LIFECYCLE STATUS
-- ============================================

-- Expand status from 3 to 5 states
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_status_check
CHECK (status IN ('draft', 'experimental', 'published', 'deprecated', 'archived'));

-- ============================================
-- 2. NEW SOURCE TYPE FOR DAILY SUMMARIES
-- ============================================

ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_source_check;
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_source_check
CHECK (source IN ('github_release', 'manual', 'daily_summary'));

-- ============================================
-- 3. DAILY SUMMARY METADATA COLUMNS
-- ============================================

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS summary_date date;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS areas_changed text[];

-- Index for finding summaries by date
CREATE INDEX IF NOT EXISTS idx_blog_posts_summary_date ON blog_posts(summary_date) WHERE summary_date IS NOT NULL;

-- ============================================
-- 4. ADMIN FUNCTION: LIST ALL POSTS
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_blog_posts(
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  technical_content text,
  cover_image_url text,
  source text,
  status text,
  version text,
  summary_date date,
  areas_changed text[],
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/superadmin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    bp.id, bp.slug, bp.title, bp.story_content, bp.technical_content,
    bp.cover_image_url, bp.source, bp.status, bp.version,
    bp.summary_date, bp.areas_changed,
    bp.published_at, bp.created_at, bp.updated_at,
    bc.slug AS category_slug, bc.name AS category_name,
    (SELECT count(*) FROM blog_post_likes WHERE post_id = bp.id) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE (p_status IS NULL OR bp.status = p_status)
    AND (p_source IS NULL OR bp.source = p_source)
  ORDER BY bp.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_blog_posts(text, text, int, int) TO authenticated;

-- ============================================
-- 5. ADMIN FUNCTION: DELETE/ARCHIVE POST
-- ============================================

CREATE OR REPLACE FUNCTION admin_delete_blog_post(
  p_post_id uuid,
  p_hard_delete boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/superadmin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_hard_delete THEN
    DELETE FROM blog_posts WHERE id = p_post_id;
  ELSE
    UPDATE blog_posts SET status = 'archived', updated_at = now() WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'post_id', p_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_blog_post(uuid, boolean) TO authenticated;

-- ============================================
-- 6. ADMIN FUNCTION: GET SINGLE POST FOR EDITING
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_blog_post(p_post_id uuid)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  technical_content text,
  cover_image_url text,
  source text,
  status text,
  version text,
  summary_date date,
  areas_changed text[],
  meta_description text,
  seo_keywords text[],
  suggested_cta_url text,
  suggested_cta_text text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category_id uuid,
  category_slug text,
  category_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/superadmin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    bp.id, bp.slug, bp.title, bp.story_content, bp.technical_content,
    bp.cover_image_url, bp.source, bp.status, bp.version,
    bp.summary_date, bp.areas_changed,
    bp.meta_description, bp.seo_keywords,
    bp.suggested_cta_url, bp.suggested_cta_text,
    bp.published_at, bp.created_at, bp.updated_at,
    bp.category_id,
    bc.slug AS category_slug, bc.name AS category_name
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_blog_post(uuid) TO authenticated;

-- ============================================
-- 7. ADMIN FUNCTION: UPDATE POST
-- ============================================

CREATE OR REPLACE FUNCTION admin_update_blog_post(
  p_post_id uuid,
  p_title text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_story_content text DEFAULT NULL,
  p_technical_content text DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_meta_description text DEFAULT NULL,
  p_seo_keywords text[] DEFAULT NULL,
  p_suggested_cta_url text DEFAULT NULL,
  p_suggested_cta_text text DEFAULT NULL,
  p_areas_changed text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  -- Admin/superadmin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Get current status for publish timestamp logic
  SELECT status INTO v_old_status FROM blog_posts WHERE id = p_post_id;

  UPDATE blog_posts SET
    title = COALESCE(p_title, title),
    slug = COALESCE(p_slug, slug),
    story_content = COALESCE(p_story_content, story_content),
    technical_content = COALESCE(p_technical_content, technical_content),
    cover_image_url = COALESCE(p_cover_image_url, cover_image_url),
    status = COALESCE(p_status, status),
    category_id = COALESCE(p_category_id, category_id),
    meta_description = COALESCE(p_meta_description, meta_description),
    seo_keywords = COALESCE(p_seo_keywords, seo_keywords),
    suggested_cta_url = COALESCE(p_suggested_cta_url, suggested_cta_url),
    suggested_cta_text = COALESCE(p_suggested_cta_text, suggested_cta_text),
    areas_changed = COALESCE(p_areas_changed, areas_changed),
    -- Set published_at when first publishing
    published_at = CASE
      WHEN p_status = 'published' AND (v_old_status != 'published' OR published_at IS NULL)
      THEN now()
      ELSE published_at
    END,
    updated_at = now()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('ok', true, 'post_id', p_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_blog_post(uuid, text, text, text, text, text, text, uuid, text, text[], text, text, text[]) TO authenticated;

-- ============================================
-- 8. ADMIN FUNCTION: CREATE POST
-- ============================================

CREATE OR REPLACE FUNCTION admin_create_blog_post(
  p_title text,
  p_slug text,
  p_story_content text,
  p_technical_content text,
  p_source text DEFAULT 'manual',
  p_status text DEFAULT 'draft',
  p_category_id uuid DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_meta_description text DEFAULT NULL,
  p_seo_keywords text[] DEFAULT NULL,
  p_suggested_cta_url text DEFAULT NULL,
  p_suggested_cta_text text DEFAULT NULL,
  p_summary_date date DEFAULT NULL,
  p_areas_changed text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  -- Admin/superadmin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO blog_posts (
    title, slug, story_content, technical_content,
    source, status, category_id, cover_image_url,
    meta_description, seo_keywords,
    suggested_cta_url, suggested_cta_text,
    summary_date, areas_changed,
    published_at
  ) VALUES (
    p_title, p_slug, p_story_content, p_technical_content,
    p_source, p_status, p_category_id, p_cover_image_url,
    p_meta_description, p_seo_keywords,
    p_suggested_cta_url, p_suggested_cta_text,
    p_summary_date, p_areas_changed,
    CASE WHEN p_status = 'published' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('ok', true, 'post_id', v_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_blog_post(text, text, text, text, text, text, uuid, text, text, text[], text, text, date, text[]) TO authenticated;

-- ============================================
-- 9. STORAGE BUCKET FOR VOICE RECORDINGS
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-audio', 'blog-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Admin-only upload for voice recordings
CREATE POLICY "blog_audio_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'blog-audio' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- Allow reading for transcription API (via service role or signed URL)
CREATE POLICY "blog_audio_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-audio');

-- Admin can delete audio files
CREATE POLICY "blog_audio_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'blog-audio' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);
