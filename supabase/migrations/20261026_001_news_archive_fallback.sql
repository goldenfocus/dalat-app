-- Keep Latest News genuinely fresh while retaining established reporting as
-- an explicitly dated archive. This preserves indexed URLs and gives the news
-- section a useful fail-safe when no current story has cleared verification.

CREATE OR REPLACE FUNCTION get_news_archive_posts(
  p_tag text DEFAULT NULL,
  p_limit integer DEFAULT 25,
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
    false,
    bp.news_tags,
    bp.news_topic,
    bp.related_event_ids
  FROM blog_posts bp
  JOIN blog_categories bc ON bc.id = bp.category_id
  WHERE bc.slug = 'news'
    AND bp.status = 'published'
    AND COALESCE(bp.source_published_at, bp.published_at) < now() - interval '14 days'
    AND (p_tag IS NULL OR p_tag = ANY(bp.news_tags))
  ORDER BY COALESCE(bp.source_published_at, bp.published_at) DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 0), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Retry only recent failures caused by the now-fixed encoded-source mismatch.
-- Other failures remain quarantined for diagnosis.
UPDATE news_raw_articles
SET
  status = 'pending',
  cluster_id = NULL,
  processed_at = NULL,
  error_message = NULL
WHERE status = 'error'
  AND published_at >= now() - interval '72 hours'
  AND error_message LIKE '%evidence-not-found%';
