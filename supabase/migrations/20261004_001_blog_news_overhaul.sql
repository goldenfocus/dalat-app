-- =============================================================================
-- Blog/News overhaul: persistent pipeline logging + RPC fixes
--   1. content_pipeline_events table (service-role only) for pipeline logging
--   2. get_blog_post_by_slug: experimental news posts are publicly listed on
--      /news, so they must also be readable on their detail page
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. content_pipeline_events: persistent log for the news/blog pipeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text,
  stage text NOT NULL,
  post_id uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_pipeline_events_created_at
  ON content_pipeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_events_level_created_at
  ON content_pipeline_events(level, created_at DESC);

-- No policies: service-role access only.
ALTER TABLE content_pipeline_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. get_blog_post_by_slug: experimental news posts are publicly listed on
--    /news (get_news_posts returns them), so their detail page must resolve
--    too. Body copied verbatim from 20260416_001_cover_image_metadata.sql;
--    only the status predicate changed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_blog_post_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  technical_content text,
  cover_image_url text,
  cover_image_alt text,
  cover_image_description text,
  cover_image_keywords text[],
  cover_image_colors text[],
  suggested_cta_url text,
  suggested_cta_text text,
  meta_description text,
  social_share_text text,
  seo_keywords text[],
  related_feature_slugs text[],
  version text,
  source text,
  published_at timestamptz,
  created_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.slug,
    bp.title,
    bp.story_content,
    bp.technical_content,
    bp.cover_image_url,
    bp.cover_image_alt,
    bp.cover_image_description,
    bp.cover_image_keywords,
    bp.cover_image_colors,
    bp.suggested_cta_url,
    bp.suggested_cta_text,
    bp.meta_description,
    bp.social_share_text,
    bp.seo_keywords,
    bp.related_feature_slugs,
    bp.version,
    bp.source::text,
    bp.published_at,
    bp.created_at,
    bc.slug AS category_slug,
    bc.name AS category_name,
    COALESCE(
      (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id),
      0
    ) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.slug = p_slug
    AND (bp.status = 'published' OR (bc.slug = 'news' AND bp.status = 'experimental'))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
