-- ============================================
-- Cover Image Metadata for SEO/AEO/GEO
-- ============================================
-- Adds comprehensive image metadata to blog posts
-- for search engine optimization and AI discoverability
-- ============================================

-- Add cover image metadata columns to blog_posts
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS cover_image_alt text,           -- Short alt text for accessibility
ADD COLUMN IF NOT EXISTS cover_image_description text,   -- Longer description for AI search
ADD COLUMN IF NOT EXISTS cover_image_keywords text[],    -- Keywords from the image
ADD COLUMN IF NOT EXISTS cover_image_colors text[];      -- Dominant colors (hex values)

-- Add helpful comments
COMMENT ON COLUMN blog_posts.cover_image_alt IS 'Short alt text for accessibility and SEO (50-125 chars)';
COMMENT ON COLUMN blog_posts.cover_image_description IS 'Detailed image description for AI engines and search';
COMMENT ON COLUMN blog_posts.cover_image_keywords IS 'Keywords describing the image content';
COMMENT ON COLUMN blog_posts.cover_image_colors IS 'Dominant color hex codes (e.g., #8B5CF6)';

-- ============================================
-- Update RPC Functions to Include New Columns
-- ============================================

-- Drop existing functions first (they'll be recreated with new signatures)
DROP FUNCTION IF EXISTS get_blog_posts(text, integer, integer);
DROP FUNCTION IF EXISTS get_blog_post_by_slug(text);

-- Recreate get_blog_posts with cover image metadata
CREATE OR REPLACE FUNCTION get_blog_posts(
  p_category_slug text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  cover_image_url text,
  cover_image_alt text,
  cover_image_description text,
  cover_image_keywords text[],
  cover_image_colors text[],
  version text,
  source text,
  published_at timestamptz,
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
    bp.cover_image_url,
    bp.cover_image_alt,
    bp.cover_image_description,
    bp.cover_image_keywords,
    bp.cover_image_colors,
    bp.version,
    bp.source::text,
    bp.published_at,
    bc.slug AS category_slug,
    bc.name AS category_name,
    COALESCE(
      (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id),
      0
    ) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.status = 'published'
    AND (p_category_slug IS NULL OR bc.slug = p_category_slug)
  ORDER BY bp.published_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Recreate get_blog_post_by_slug with cover image metadata
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
    AND bp.status = 'published'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- Update Admin RPC Functions
-- ============================================

-- Drop existing admin functions
DROP FUNCTION IF EXISTS get_blog_posts_admin(text, integer, integer);
DROP FUNCTION IF EXISTS get_blog_post_admin(uuid);

-- Recreate admin list function with metadata
CREATE OR REPLACE FUNCTION get_blog_posts_admin(
  p_category_slug text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  cover_image_url text,
  cover_image_alt text,
  cover_image_description text,
  cover_image_keywords text[],
  cover_image_colors text[],
  version text,
  source text,
  status text,
  published_at timestamptz,
  created_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
) AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_can_blog boolean;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  SELECT role, can_blog INTO v_role, v_can_blog
  FROM profiles
  WHERE id = v_user_id;

  -- Require admin/superadmin role OR can_blog permission
  IF v_role NOT IN ('admin', 'superadmin') AND v_can_blog IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    bp.id,
    bp.slug,
    bp.title,
    bp.story_content,
    bp.cover_image_url,
    bp.cover_image_alt,
    bp.cover_image_description,
    bp.cover_image_keywords,
    bp.cover_image_colors,
    bp.version,
    bp.source::text,
    bp.status::text,
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
  WHERE (p_category_slug IS NULL OR bc.slug = p_category_slug)
  ORDER BY bp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Recreate admin single post function with metadata
CREATE OR REPLACE FUNCTION get_blog_post_admin(p_post_id uuid)
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
  status text,
  github_release_id bigint,
  published_at timestamptz,
  created_at timestamptz,
  category_id uuid,
  category_slug text,
  category_name text,
  like_count bigint
) AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_can_blog boolean;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  SELECT role, can_blog INTO v_role, v_can_blog
  FROM profiles
  WHERE id = v_user_id;

  -- Require admin/superadmin role OR can_blog permission
  IF v_role NOT IN ('admin', 'superadmin') AND v_can_blog IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
    bp.status::text,
    bp.github_release_id,
    bp.published_at,
    bp.created_at,
    bp.category_id,
    bc.slug AS category_slug,
    bc.name AS category_name,
    COALESCE(
      (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id),
      0
    ) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.id = p_post_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- Update Blog Post Update Function
-- ============================================

-- Drop and recreate update function with new parameters
DROP FUNCTION IF EXISTS update_blog_post(uuid, text, text, text, text, text, text, text, text, text[], text[], text, text, uuid, text);

CREATE OR REPLACE FUNCTION update_blog_post(
  p_post_id uuid,
  p_title text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_story_content text DEFAULT NULL,
  p_technical_content text DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_cover_image_alt text DEFAULT NULL,
  p_cover_image_description text DEFAULT NULL,
  p_cover_image_keywords text[] DEFAULT NULL,
  p_cover_image_colors text[] DEFAULT NULL,
  p_suggested_cta_url text DEFAULT NULL,
  p_suggested_cta_text text DEFAULT NULL,
  p_meta_description text DEFAULT NULL,
  p_social_share_text text DEFAULT NULL,
  p_seo_keywords text[] DEFAULT NULL,
  p_related_feature_slugs text[] DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_can_blog boolean;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  SELECT role, can_blog INTO v_role, v_can_blog
  FROM profiles
  WHERE id = v_user_id;

  -- Require admin/superadmin role OR can_blog permission
  IF v_role NOT IN ('admin', 'superadmin') AND v_can_blog IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE blog_posts SET
    title = COALESCE(p_title, title),
    slug = COALESCE(p_slug, slug),
    story_content = COALESCE(p_story_content, story_content),
    technical_content = COALESCE(p_technical_content, technical_content),
    cover_image_url = COALESCE(p_cover_image_url, cover_image_url),
    cover_image_alt = COALESCE(p_cover_image_alt, cover_image_alt),
    cover_image_description = COALESCE(p_cover_image_description, cover_image_description),
    cover_image_keywords = COALESCE(p_cover_image_keywords, cover_image_keywords),
    cover_image_colors = COALESCE(p_cover_image_colors, cover_image_colors),
    suggested_cta_url = COALESCE(p_suggested_cta_url, suggested_cta_url),
    suggested_cta_text = COALESCE(p_suggested_cta_text, suggested_cta_text),
    meta_description = COALESCE(p_meta_description, meta_description),
    social_share_text = COALESCE(p_social_share_text, social_share_text),
    seo_keywords = COALESCE(p_seo_keywords, seo_keywords),
    related_feature_slugs = COALESCE(p_related_feature_slugs, related_feature_slugs),
    status = COALESCE(p_status, status)::blog_post_status,
    category_id = COALESCE(p_category_id, category_id),
    published_at = CASE
      WHEN p_status = 'published' AND published_at IS NULL THEN NOW()
      ELSE published_at
    END,
    updated_at = NOW()
  WHERE id = p_post_id;

  RETURN p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Update Blog Post Create Function
-- ============================================

-- Drop and recreate create function with new parameters
DROP FUNCTION IF EXISTS create_blog_post(text, text, text, text, text, text, text, text, text[], text[], text, text, uuid, text);

CREATE OR REPLACE FUNCTION create_blog_post(
  p_title text,
  p_slug text,
  p_story_content text,
  p_technical_content text,
  p_source text DEFAULT 'manual',
  p_status text DEFAULT 'draft',
  p_category_id uuid DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_cover_image_alt text DEFAULT NULL,
  p_cover_image_description text DEFAULT NULL,
  p_cover_image_keywords text[] DEFAULT NULL,
  p_cover_image_colors text[] DEFAULT NULL,
  p_suggested_cta_url text DEFAULT NULL,
  p_suggested_cta_text text DEFAULT NULL,
  p_meta_description text DEFAULT NULL,
  p_social_share_text text DEFAULT NULL,
  p_seo_keywords text[] DEFAULT NULL,
  p_related_feature_slugs text[] DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_can_blog boolean;
  v_post_id uuid;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  SELECT role, can_blog INTO v_role, v_can_blog
  FROM profiles
  WHERE id = v_user_id;

  -- Require admin/superadmin role OR can_blog permission
  IF v_role NOT IN ('admin', 'superadmin') AND v_can_blog IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO blog_posts (
    title, slug, story_content, technical_content,
    source, status, category_id, cover_image_url,
    cover_image_alt, cover_image_description, cover_image_keywords, cover_image_colors,
    suggested_cta_url, suggested_cta_text, meta_description,
    social_share_text, seo_keywords, related_feature_slugs,
    published_at
  ) VALUES (
    p_title, p_slug, p_story_content, p_technical_content,
    p_source::blog_post_source, p_status::blog_post_status, p_category_id, p_cover_image_url,
    p_cover_image_alt, p_cover_image_description, p_cover_image_keywords, p_cover_image_colors,
    p_suggested_cta_url, p_suggested_cta_text, p_meta_description,
    p_social_share_text, p_seo_keywords, p_related_feature_slugs,
    CASE WHEN p_status = 'published' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
