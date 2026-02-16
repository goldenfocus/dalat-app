-- =============================================================================
-- DaLat News System
-- =============================================================================
-- Adds news scraping pipeline: raw article ingestion, clustering, and
-- publication as blog posts under a dedicated "news" category.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Insert "news" blog category
-- ---------------------------------------------------------------------------
INSERT INTO blog_categories (slug, name, description, sort_order) VALUES
  ('news', 'DaLat News', 'Local news from Đà Lạt, Lâm Đồng', 5)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Expand blog_posts source constraint to allow 'news_scrape'
-- ---------------------------------------------------------------------------
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_source_check;
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_source_check
CHECK (source IN ('github_release', 'manual', 'daily_summary', 'news_scrape'));

-- ---------------------------------------------------------------------------
-- 3. Add news-specific columns to blog_posts
-- ---------------------------------------------------------------------------
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_urls jsonb DEFAULT '[]';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_images jsonb DEFAULT '[]';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS quality_score real DEFAULT 0.0;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_breaking boolean DEFAULT false;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS news_tags text[] DEFAULT '{}';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS news_topic text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_fingerprint text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS related_event_ids uuid[] DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 4. Raw articles table (ingested by scraper, consumed by clustering pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_raw_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  source_url text UNIQUE NOT NULL,
  source_name text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  image_urls text[] DEFAULT '{}',
  published_at timestamptz,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'skipped', 'error')),
  topic_fingerprint text,
  topic_keywords text[] DEFAULT '{}',
  cluster_id text,
  blog_post_id uuid REFERENCES blog_posts(id),
  scraped_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  error_message text
);

-- Index for efficient pending article queries
CREATE INDEX IF NOT EXISTS idx_news_raw_articles_status
  ON news_raw_articles(status);

-- Index for cluster lookups (only rows that have been clustered)
CREATE INDEX IF NOT EXISTS idx_news_raw_articles_cluster
  ON news_raw_articles(cluster_id) WHERE cluster_id IS NOT NULL;

-- Index for chronological listing
CREATE INDEX IF NOT EXISTS idx_news_raw_articles_scraped
  ON news_raw_articles(scraped_at DESC);

-- RLS: Only service role can access raw articles (cron jobs use service role).
-- No policies needed — service role bypasses RLS. This ensures anon/authenticated
-- users cannot read or write raw articles directly.
ALTER TABLE news_raw_articles ENABLE ROW LEVEL SECURITY;

-- Index for dedup lookups on blog_posts.content_fingerprint
CREATE INDEX IF NOT EXISTS idx_blog_posts_content_fingerprint
  ON blog_posts(content_fingerprint) WHERE content_fingerprint IS NOT NULL;

-- Partial index for news post queries (used by get_news_posts RPC)
CREATE INDEX IF NOT EXISTS idx_blog_posts_news_published
  ON blog_posts(published_at DESC)
  WHERE source = 'news_scrape' AND status IN ('published', 'experimental');

-- ---------------------------------------------------------------------------
-- 5. RPC: get_news_posts
--    Fetches published news blog posts with optional tag / featured filtering.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_news_posts(
  p_tag text DEFAULT NULL,
  p_featured_only boolean DEFAULT false,
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
  like_count bigint,
  source_urls jsonb,
  source_images jsonb,
  quality_score real,
  is_featured boolean,
  is_breaking boolean,
  news_tags text[],
  news_topic text,
  related_event_ids uuid[]
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
    bp.source,
    bp.published_at,
    bc.slug AS category_slug,
    bc.name AS category_name,
    COALESCE(
      (SELECT COUNT(*) FROM blog_post_likes bpl WHERE bpl.post_id = bp.id),
      0
    ) AS like_count,
    bp.source_urls,
    bp.source_images,
    bp.quality_score,
    bp.is_featured,
    bp.is_breaking,
    bp.news_tags,
    bp.news_topic,
    bp.related_event_ids
  FROM blog_posts bp
  JOIN blog_categories bc ON bc.id = bp.category_id
  WHERE bc.slug = 'news'
    AND bp.status IN ('published', 'experimental')
    AND (p_tag IS NULL OR p_tag = ANY(bp.news_tags))
    AND (NOT p_featured_only OR bp.is_featured = true)
  ORDER BY
    bp.is_breaking DESC,
    bp.published_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 6. RPC: get_trending_news
--    Returns the most-liked news posts from the last 7 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_trending_news(
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  published_at timestamptz,
  like_count bigint,
  news_tags text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.slug,
    bp.title,
    bp.published_at,
    COALESCE(
      (SELECT COUNT(*) FROM blog_post_likes bpl WHERE bpl.post_id = bp.id),
      0
    ) AS like_count,
    bp.news_tags
  FROM blog_posts bp
  JOIN blog_categories bc ON bc.id = bp.category_id
  WHERE bc.slug = 'news'
    AND bp.status = 'published'
    AND bp.published_at >= now() - interval '7 days'
  ORDER BY like_count DESC, bp.published_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
