-- Fix: Remove invalid ::blog_post_status type cast from update_blog_post function
-- The blog_posts.status column uses a CHECK constraint, not a custom type
-- This was causing 400 errors when saving blog posts

-- Recreate the update function with corrected type handling
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
    -- Removed invalid ::blog_post_status cast - column uses CHECK constraint
    status = COALESCE(p_status, status),
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
