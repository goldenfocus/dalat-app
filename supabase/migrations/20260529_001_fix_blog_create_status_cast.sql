-- Fix: Remove invalid ::blog_post_source and ::blog_post_status type casts from create_blog_post
-- The blog_posts columns use CHECK constraints, not custom types

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
    -- Removed invalid type casts - columns use CHECK constraints
    p_source, p_status, p_category_id, p_cover_image_url,
    p_cover_image_alt, p_cover_image_description, p_cover_image_keywords, p_cover_image_colors,
    p_suggested_cta_url, p_suggested_cta_text, p_meta_description,
    p_social_share_text, p_seo_keywords, p_related_feature_slugs,
    CASE WHEN p_status = 'published' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
