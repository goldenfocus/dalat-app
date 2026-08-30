-- =============================================================================
-- News freshness and editorial gate
--
-- A page retrieval timestamp must never masquerade as a publication timestamp.
-- Old public URLs remain reachable, while /news contains only genuinely recent,
-- published reporting. Borderline/undated raw candidates are held for review.
-- =============================================================================

ALTER TABLE news_raw_articles
  DROP CONSTRAINT IF EXISTS news_raw_articles_status_check;
ALTER TABLE news_raw_articles
  ADD CONSTRAINT news_raw_articles_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'review', 'skipped', 'error'));

ALTER TABLE news_raw_articles
  ADD COLUMN IF NOT EXISTS editorial_disposition text,
  ADD COLUMN IF NOT EXISTS editorial_review_reason text,
  ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamptz;

ALTER TABLE news_raw_articles
  DROP CONSTRAINT IF EXISTS news_raw_articles_editorial_disposition_check;
ALTER TABLE news_raw_articles
  ADD CONSTRAINT news_raw_articles_editorial_disposition_check
  CHECK (
    editorial_disposition IS NULL OR editorial_disposition IN (
      'fresh', 'needs-review', 'historical', 'missing-date', 'future-date',
      'current-news', 'evergreen', 'reject', 'update'
    )
  );

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS editorial_disposition text,
  ADD COLUMN IF NOT EXISTS editorial_review_reason text,
  ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamptz;

ALTER TABLE blog_posts
  DROP CONSTRAINT IF EXISTS blog_posts_editorial_disposition_check;
ALTER TABLE blog_posts
  ADD CONSTRAINT blog_posts_editorial_disposition_check
  CHECK (
    editorial_disposition IS NULL OR editorial_disposition IN (
      'current-news', 'needs-review', 'evergreen', 'historical', 'reject', 'update'
    )
  );

COMMENT ON COLUMN blog_posts.source_published_at IS
  'Most recent accepted source publication time; authoritative public news date.';
COMMENT ON COLUMN blog_posts.first_seen_at IS
  'When DaLat.app first discovered the story. Never used as its publication date.';
COMMENT ON COLUMN news_raw_articles.editorial_disposition IS
  'Deterministic freshness or editorial classifier outcome before publication.';

-- Recover real publication dates from the source envelope. Malformed legacy
-- values are ignored rather than aborting the migration.
WITH source_dates AS (
  SELECT
    bp.id,
    MAX(
      CASE
        WHEN source.value->>'published_at' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
        THEN (source.value->>'published_at')::timestamptz
        ELSE NULL
      END
    ) AS source_published_at
  FROM blog_posts bp
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(bp.source_urls) = 'array' THEN bp.source_urls
      ELSE '[]'::jsonb
    END
  ) AS source(value) ON true
  WHERE bp.source = 'news_scrape'
  GROUP BY bp.id
)
UPDATE blog_posts bp
SET
  source_published_at = source_dates.source_published_at,
  -- Correct legacy pages that were dated when imported. This keeps the URL
  -- while restoring the source's actual chronological position.
  published_at = COALESCE(source_dates.source_published_at, bp.published_at),
  first_seen_at = COALESCE(bp.first_seen_at, bp.created_at),
  editorial_disposition = CASE
    WHEN source_dates.source_published_at IS NULL THEN 'needs-review'
    WHEN source_dates.source_published_at >= now() - interval '72 hours' THEN 'current-news'
    WHEN source_dates.source_published_at >= now() - interval '7 days' THEN 'needs-review'
    ELSE 'historical'
  END,
  editorial_review_reason = CASE
    WHEN source_dates.source_published_at IS NULL THEN 'Legacy article has no trustworthy source publication time'
    WHEN source_dates.source_published_at >= now() - interval '72 hours' THEN 'Legacy article source is within the fresh-news window'
    WHEN source_dates.source_published_at >= now() - interval '7 days' THEN 'Legacy article source requires editorial review'
    ELSE 'Legacy article retained at its established URL as historical reporting'
  END,
  editorial_reviewed_at = now()
FROM source_dates
WHERE bp.id = source_dates.id;

-- Quarantine unlinked backlog. Linked rows still support in-place correction of
-- established URLs, even when the original reporting is old.
UPDATE news_raw_articles
SET
  status = CASE
    WHEN published_at IS NULL THEN 'review'
    WHEN published_at > now() + interval '2 hours' THEN 'review'
    WHEN published_at < now() - interval '7 days' THEN 'skipped'
    WHEN published_at < now() - interval '72 hours' THEN 'review'
    ELSE status
  END,
  editorial_disposition = CASE
    WHEN published_at IS NULL THEN 'missing-date'
    WHEN published_at > now() + interval '2 hours' THEN 'future-date'
    WHEN published_at < now() - interval '7 days' THEN 'historical'
    WHEN published_at < now() - interval '72 hours' THEN 'needs-review'
    ELSE 'fresh'
  END,
  editorial_review_reason = CASE
    WHEN published_at IS NULL THEN 'Source publication time is missing'
    WHEN published_at > now() + interval '2 hours' THEN 'Source publication time is implausibly in the future'
    WHEN published_at < now() - interval '7 days' THEN 'Historical backlog cannot enter Latest News'
    WHEN published_at < now() - interval '72 hours' THEN 'Candidate is older than the automatic publication window'
    ELSE 'Candidate is within the fresh-news window'
  END,
  editorial_reviewed_at = now(),
  processed_at = CASE
    WHEN published_at IS NULL
      OR published_at > now() + interval '2 hours'
      OR published_at < now() - interval '72 hours'
    THEN now()
    ELSE processed_at
  END
WHERE blog_post_id IS NULL
  AND status IN ('pending', 'error');

DROP INDEX IF EXISTS idx_blog_posts_news_published;
CREATE INDEX idx_blog_posts_news_published
  ON blog_posts(source_published_at DESC)
  WHERE source = 'news_scrape' AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_news_raw_articles_editorial_review
  ON news_raw_articles(editorial_reviewed_at DESC)
  WHERE status = 'review';

-- Latest News is a freshness surface, not the complete URL archive. Historical
-- and experimental pages remain directly reachable and stay in the regular
-- sitemap, but cannot masquerade as current reporting here.
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
    COALESCE(bp.source_published_at, bp.published_at),
    bc.slug,
    bc.name,
    COALESCE((SELECT COUNT(*) FROM blog_post_likes bpl WHERE bpl.post_id = bp.id), 0),
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
    AND bp.status = 'published'
    AND COALESCE(bp.source_published_at, bp.published_at) >= now() - interval '14 days'
    AND (p_tag IS NULL OR p_tag = ANY(bp.news_tags))
    AND (NOT p_featured_only OR bp.is_featured = true)
  ORDER BY
    bp.is_breaking DESC,
    COALESCE(bp.source_published_at, bp.published_at) DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_trending_news(p_limit integer DEFAULT 5)
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
    COALESCE(bp.source_published_at, bp.published_at),
    COALESCE((SELECT COUNT(*) FROM blog_post_likes bpl WHERE bpl.post_id = bp.id), 0),
    bp.news_tags
  FROM blog_posts bp
  JOIN blog_categories bc ON bc.id = bp.category_id
  WHERE bc.slug = 'news'
    AND bp.status = 'published'
    AND COALESCE(bp.source_published_at, bp.published_at) >= now() - interval '7 days'
  ORDER BY like_count DESC, COALESCE(bp.source_published_at, bp.published_at) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Human approval still cannot turn an old or undated source into fresh news.
-- For an eligible news draft, approval preserves the source date rather than
-- stamping the editor's click time.
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
  v_source text;
  v_source_published_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  SELECT role, can_blog INTO v_role, v_can_blog FROM profiles WHERE id = v_user_id;
  IF v_role NOT IN ('admin', 'superadmin') AND v_can_blog IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT source, source_published_at
  INTO v_source, v_source_published_at
  FROM blog_posts
  WHERE id = p_post_id;

  IF p_status = 'published' AND v_source = 'news_scrape' AND (
    v_source_published_at IS NULL
    OR v_source_published_at < now() - interval '72 hours'
    OR v_source_published_at > now() + interval '2 hours'
  ) THEN
    RAISE EXCEPTION 'News cannot be published: source date is missing or outside the 72-hour freshness window';
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
    status = COALESCE(p_status, status),
    category_id = COALESCE(p_category_id, category_id),
    published_at = CASE
      WHEN p_status = 'published' AND source = 'news_scrape' THEN source_published_at
      WHEN p_status = 'published' AND published_at IS NULL THEN now()
      ELSE published_at
    END,
    editorial_disposition = CASE
      WHEN p_status = 'published' AND source = 'news_scrape' THEN 'current-news'
      ELSE editorial_disposition
    END,
    editorial_review_reason = CASE
      WHEN p_status = 'published' AND source = 'news_scrape' THEN 'Approved by an authorized DaLat.app editor'
      ELSE editorial_review_reason
    END,
    editorial_reviewed_at = CASE
      WHEN p_status = 'published' AND source = 'news_scrape' THEN now()
      ELSE editorial_reviewed_at
    END,
    updated_at = now()
  WHERE id = p_post_id;

  RETURN p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
