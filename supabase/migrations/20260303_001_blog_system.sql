-- Blog System: Human-First, Machine-Complete
-- Auto-generated from GitHub releases with dual content (story + technical)

-- ============================================
-- CATEGORIES TABLE
-- ============================================

CREATE TABLE blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,  -- 'changelog', 'stories', 'guides'
  name text NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default categories
INSERT INTO blog_categories (slug, name, description, sort_order) VALUES
  ('changelog', 'Changelog', 'Product updates and release notes', 1),
  ('stories', 'Stories', 'Behind the scenes and company updates', 2),
  ('guides', 'Guides', 'Tips and tutorials', 3);

-- ============================================
-- BLOG POSTS TABLE
-- ============================================

CREATE TABLE blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking
  source text NOT NULL CHECK (source IN ('github_release', 'manual')),
  github_release_id bigint UNIQUE,
  version text,  -- "1.2.3" for releases

  -- Category
  category_id uuid REFERENCES blog_categories(id) ON DELETE SET NULL,

  -- Human Content (story-driven)
  title text NOT NULL,
  story_content text NOT NULL,  -- Human-readable story (markdown)
  cover_image_url text,
  suggested_cta_url text,       -- "Try it now" link
  suggested_cta_text text,      -- CTA button text

  -- Machine Content (SEO/AI)
  technical_content text NOT NULL,  -- Detailed markdown for AI/SEO
  seo_keywords text[] DEFAULT '{}',
  related_feature_slugs text[] DEFAULT '{}',  -- Links to related posts

  -- Meta
  slug text UNIQUE NOT NULL,
  meta_description text,
  social_share_text text,

  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_source ON blog_posts(source);

-- ============================================
-- BLOG POST LIKES (mirrors moment_likes)
-- ============================================

CREATE TABLE blog_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES blog_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  -- Each user can only like a post once
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_blog_post_likes_post ON blog_post_likes(post_id);
CREATE INDEX idx_blog_post_likes_user ON blog_post_likes(user_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_likes ENABLE ROW LEVEL SECURITY;

-- Categories: Public read, admin write
CREATE POLICY "blog_categories_select_public"
ON blog_categories FOR SELECT USING (true);

CREATE POLICY "blog_categories_admin_all"
ON blog_categories FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Posts: Published are public, draft/archived require admin
CREATE POLICY "blog_posts_select_published"
ON blog_posts FOR SELECT
USING (status = 'published');

CREATE POLICY "blog_posts_select_admin"
ON blog_posts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "blog_posts_admin_all"
ON blog_posts FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Likes: Public read, authenticated write own
CREATE POLICY "blog_post_likes_select_public"
ON blog_post_likes FOR SELECT USING (true);

CREATE POLICY "blog_post_likes_insert_authenticated"
ON blog_post_likes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blog_post_likes_delete_own"
ON blog_post_likes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Toggle like on a blog post (like/unlike)
CREATE OR REPLACE FUNCTION toggle_blog_post_like(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_existing_like uuid;
  v_new_liked boolean;
  v_new_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Check if post exists and is published
  IF NOT EXISTS (
    SELECT 1 FROM blog_posts WHERE id = p_post_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  -- Check if user already liked this post
  SELECT id INTO v_existing_like
  FROM blog_post_likes
  WHERE post_id = p_post_id AND user_id = v_uid;

  IF v_existing_like IS NOT NULL THEN
    -- Unlike: remove the like
    DELETE FROM blog_post_likes WHERE id = v_existing_like;
    v_new_liked := false;
  ELSE
    -- Like: add a new like
    INSERT INTO blog_post_likes (post_id, user_id)
    VALUES (p_post_id, v_uid);
    v_new_liked := true;
  END IF;

  -- Get updated count
  SELECT count(*) INTO v_new_count
  FROM blog_post_likes
  WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok', true,
    'post_id', p_post_id,
    'liked', v_new_liked,
    'count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_blog_post_like(uuid) TO authenticated;

-- Get like status and count for a blog post
CREATE OR REPLACE FUNCTION get_blog_post_like_status(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_liked boolean;
  v_count int;
BEGIN
  v_uid := auth.uid();

  -- Get count
  SELECT count(*) INTO v_count
  FROM blog_post_likes
  WHERE post_id = p_post_id;

  -- Check if current user liked it
  IF v_uid IS NOT NULL THEN
    v_liked := EXISTS (
      SELECT 1 FROM blog_post_likes
      WHERE post_id = p_post_id AND user_id = v_uid
    );
  ELSE
    v_liked := false;
  END IF;

  RETURN jsonb_build_object(
    'post_id', p_post_id,
    'liked', v_liked,
    'count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_blog_post_like_status(uuid) TO anon, authenticated;

-- Get like counts for multiple posts at once (batch query)
CREATE OR REPLACE FUNCTION get_blog_post_like_counts(p_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  liked boolean,
  count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  RETURN QUERY
  SELECT
    p.id AS post_id,
    CASE WHEN v_uid IS NOT NULL THEN
      EXISTS (
        SELECT 1 FROM blog_post_likes bpl
        WHERE bpl.post_id = p.id AND bpl.user_id = v_uid
      )
    ELSE false END AS liked,
    (SELECT count(*) FROM blog_post_likes bpl WHERE bpl.post_id = p.id) AS count
  FROM unnest(p_post_ids) AS p(id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_blog_post_like_counts(uuid[]) TO anon, authenticated;

-- ============================================
-- FETCH FUNCTIONS
-- ============================================

-- Get published blog posts with category info
CREATE OR REPLACE FUNCTION get_blog_posts(
  p_category_slug text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  cover_image_url text,
  version text,
  source text,
  published_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.slug,
    bp.title,
    bp.story_content,
    bp.cover_image_url,
    bp.version,
    bp.source,
    bp.published_at,
    bc.slug AS category_slug,
    bc.name AS category_name,
    (SELECT count(*) FROM blog_post_likes WHERE post_id = bp.id) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.status = 'published'
    AND (p_category_slug IS NULL OR bc.slug = p_category_slug)
  ORDER BY bp.published_at DESC NULLS LAST, bp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_blog_posts(text, int, int) TO anon, authenticated;

-- Get a single blog post by slug (with full content)
CREATE OR REPLACE FUNCTION get_blog_post_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  technical_content text,
  cover_image_url text,
  suggested_cta_url text,
  suggested_cta_text text,
  version text,
  source text,
  meta_description text,
  social_share_text text,
  seo_keywords text[],
  related_feature_slugs text[],
  published_at timestamptz,
  created_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.slug,
    bp.title,
    bp.story_content,
    bp.technical_content,
    bp.cover_image_url,
    bp.suggested_cta_url,
    bp.suggested_cta_text,
    bp.version,
    bp.source,
    bp.meta_description,
    bp.social_share_text,
    bp.seo_keywords,
    bp.related_feature_slugs,
    bp.published_at,
    bp.created_at,
    bc.slug AS category_slug,
    bc.name AS category_name,
    (SELECT count(*) FROM blog_post_likes WHERE post_id = bp.id) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE bp.slug = p_slug
    AND bp.status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION get_blog_post_by_slug(text) TO anon, authenticated;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_blog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_updated_at();

CREATE TRIGGER blog_categories_updated_at
  BEFORE UPDATE ON blog_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_updated_at();
