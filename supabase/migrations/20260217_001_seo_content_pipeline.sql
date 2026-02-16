-- ============================================
-- SEO CONTENT PIPELINE
-- Migration: 20260217_001_seo_content_pipeline
-- ============================================
-- Foundation for the 14-agent SEO/AEO/GEO content factory.
-- Creates 6 new tables, extends blog_posts, adds blog categories,
-- and updates content_translations constraints.
--
-- Tables:
--   content_queue     — Pipeline for all generated content
--   content_sources   — Universal staging for scraped content
--   keyword_research  — SEO keyword tracking
--   agent_runs        — Execution history and cost tracking
--   pillar_pages      — Evergreen guide metadata
--   trending_topics   — Trends from social + news signals

-- ============================================
-- 1. CONTENT QUEUE
-- ============================================

CREATE TABLE content_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  content_type text NOT NULL CHECK (content_type IN (
    'news', 'guide', 'pillar', 'event_preview', 'event_recap',
    'monthly_guide', 'activity_guide', 'trend_report'
  )),
  title text NOT NULL,
  brief text,
  source_urls text[] DEFAULT '{}',
  source_data jsonb DEFAULT '{}',

  assigned_agent text,
  priority int NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  target_keywords text[] DEFAULT '{}',

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'generating', 'draft', 'reviewing', 'approved', 'published', 'rejected'
  )),

  blog_post_id uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
  quality_score float,
  revision_notes text,
  revision_count int NOT NULL DEFAULT 0,
  scheduled_publish_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_queue_status_priority ON content_queue(status, priority DESC);
CREATE INDEX idx_content_queue_content_type ON content_queue(content_type);
CREATE INDEX idx_content_queue_assigned_agent ON content_queue(assigned_agent) WHERE assigned_agent IS NOT NULL;
CREATE INDEX idx_content_queue_blog_post ON content_queue(blog_post_id) WHERE blog_post_id IS NOT NULL;

COMMENT ON TABLE content_queue IS 'Pipeline for all AI-generated content items. Agents pick items from this queue.';

-- ============================================
-- 2. CONTENT SOURCES
-- ============================================

CREATE TABLE content_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_platform text NOT NULL CHECK (source_platform IN (
    'vnexpress', 'tuoitre', 'thanhnien', 'lamdong_gov', 'google_news',
    'facebook', 'instagram', 'tiktok'
  )),
  source_url text NOT NULL,
  source_url_hash text NOT NULL GENERATED ALWAYS AS (md5(source_url)) STORED,

  raw_title text,
  raw_content text,
  raw_html text,
  raw_images text[] DEFAULT '{}',
  raw_publish_date timestamptz,

  content_category text CHECK (content_category IN (
    'news', 'event', 'social', 'travel', 'business', 'weather', 'government'
  )),
  relevance_score float CHECK (relevance_score BETWEEN 0 AND 1),
  quality_score float CHECK (quality_score BETWEEN 0 AND 1),

  ai_summary text,
  ai_tags text[] DEFAULT '{}',
  named_entities jsonb DEFAULT '{}',

  is_duplicate boolean NOT NULL DEFAULT false,
  canonical_source_id uuid REFERENCES content_sources(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'raw' CHECK (status IN (
    'raw', 'classified', 'enriched', 'published', 'duplicate', 'rejected'
  )),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_content_sources_url_hash ON content_sources(source_url_hash);
CREATE INDEX idx_content_sources_platform ON content_sources(source_platform);
CREATE INDEX idx_content_sources_status ON content_sources(status);
CREATE INDEX idx_content_sources_category ON content_sources(content_category) WHERE content_category IS NOT NULL;
CREATE INDEX idx_content_sources_relevance ON content_sources(relevance_score DESC) WHERE relevance_score IS NOT NULL;
CREATE INDEX idx_content_sources_publish_date ON content_sources(raw_publish_date DESC) WHERE raw_publish_date IS NOT NULL;

COMMENT ON TABLE content_sources IS 'Universal staging table for all scraped content from news, social, and government sources.';

-- ============================================
-- 3. KEYWORD RESEARCH
-- ============================================

CREATE TABLE keyword_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  keyword text NOT NULL,
  keyword_locale text NOT NULL DEFAULT 'en',
  search_volume_estimate int,
  difficulty_estimate int CHECK (difficulty_estimate BETWEEN 1 AND 100),
  search_intent text CHECK (search_intent IN (
    'informational', 'navigational', 'commercial', 'transactional'
  )),

  current_rank int,
  current_url text,
  content_exists boolean NOT NULL DEFAULT false,

  topic_cluster text,
  is_long_tail boolean NOT NULL DEFAULT false,
  rank_history jsonb DEFAULT '[]',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_keyword_research_unique ON keyword_research(keyword, keyword_locale);
CREATE INDEX idx_keyword_research_cluster ON keyword_research(topic_cluster) WHERE topic_cluster IS NOT NULL;
CREATE INDEX idx_keyword_research_volume ON keyword_research(search_volume_estimate DESC NULLS LAST);
CREATE INDEX idx_keyword_research_uncovered ON keyword_research(content_exists, search_volume_estimate DESC NULLS LAST)
  WHERE content_exists = false;

COMMENT ON TABLE keyword_research IS 'SEO keyword tracking across locales with rank history.';

-- ============================================
-- 4. AGENT RUNS
-- ============================================

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_name text NOT NULL,
  inngest_run_id text,

  status text NOT NULL DEFAULT 'running' CHECK (status IN (
    'running', 'completed', 'failed', 'skipped'
  )),

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,

  items_processed int NOT NULL DEFAULT 0,
  items_created int NOT NULL DEFAULT 0,
  items_skipped int NOT NULL DEFAULT 0,
  errors_count int NOT NULL DEFAULT 0,

  output jsonb DEFAULT '{}',

  -- Cost tracking
  api_calls_claude int NOT NULL DEFAULT 0,
  api_calls_google_translate int NOT NULL DEFAULT 0,
  api_calls_gemini int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(8, 4) NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_started ON agent_runs(started_at DESC);
CREATE INDEX idx_agent_runs_agent_recent ON agent_runs(agent_name, started_at DESC);

COMMENT ON TABLE agent_runs IS 'Execution history and cost tracking for all 14 SEO agents.';

-- ============================================
-- 5. PILLAR PAGES
-- ============================================

CREATE TABLE pillar_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  blog_post_id uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  topic_cluster text NOT NULL,
  target_keyword text NOT NULL,
  target_word_count int NOT NULL DEFAULT 3000,

  data_sources jsonb DEFAULT '{}',

  last_refreshed_at timestamptz,
  refresh_frequency_days int NOT NULL DEFAULT 30,
  needs_refresh boolean NOT NULL DEFAULT false,

  current_rank int,
  monthly_traffic int,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pillar_pages_blog_post ON pillar_pages(blog_post_id);
CREATE INDEX idx_pillar_pages_cluster ON pillar_pages(topic_cluster);
CREATE INDEX idx_pillar_pages_needs_refresh ON pillar_pages(needs_refresh) WHERE needs_refresh = true;

COMMENT ON TABLE pillar_pages IS 'Metadata for evergreen pillar/guide pages that auto-refresh.';

-- ============================================
-- 6. TRENDING TOPICS
-- ============================================

CREATE TABLE trending_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  topic_name text NOT NULL,
  topic_slug text NOT NULL,
  topic_category text CHECK (topic_category IN (
    'food', 'cafe', 'nature', 'nightlife', 'culture', 'weather',
    'music', 'art', 'travel', 'business', 'festival', 'other'
  )),

  mention_count int NOT NULL DEFAULT 0,
  engagement_score float NOT NULL DEFAULT 0,
  trend_velocity float NOT NULL DEFAULT 0,

  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,

  source_counts jsonb DEFAULT '{}',
  related_venue_ids uuid[] DEFAULT '{}',
  related_event_ids uuid[] DEFAULT '{}',

  ai_summary text,
  cover_image_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trending_topics_category ON trending_topics(topic_category);
CREATE INDEX idx_trending_topics_velocity ON trending_topics(trend_velocity DESC);
CREATE INDEX idx_trending_topics_window ON trending_topics(window_end DESC);

COMMENT ON TABLE trending_topics IS 'Trending topics detected from social media and news signals.';

-- ============================================
-- 7. EXTEND BLOG_POSTS
-- ============================================

-- New content type column (blog = default for existing posts)
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'blog'
  CHECK (content_type IN ('blog', 'pillar', 'news', 'place', 'guide', 'programmatic'));

-- Pillar page reference
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS pillar_page_id uuid REFERENCES pillar_pages(id) ON DELETE SET NULL;

-- Content metrics
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS word_count int;

ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS reading_time_minutes int;

-- Internal linking
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS internal_links text[] DEFAULT '{}';

-- FAQ data for FAQ schema
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS faq_data jsonb;

-- Data freshness tracking
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS data_freshness_at timestamptz;

-- Auto-generated flag
ALTER TABLE blog_posts
ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;

CREATE INDEX idx_blog_posts_content_type ON blog_posts(content_type);
CREATE INDEX idx_blog_posts_auto_generated ON blog_posts(auto_generated) WHERE auto_generated = true;
CREATE INDEX idx_blog_posts_pillar_page ON blog_posts(pillar_page_id) WHERE pillar_page_id IS NOT NULL;

-- Update source CHECK to allow new sources
ALTER TABLE blog_posts
DROP CONSTRAINT IF EXISTS blog_posts_source_check;

ALTER TABLE blog_posts
ADD CONSTRAINT blog_posts_source_check
CHECK (source IN ('github_release', 'manual', 'daily_summary', 'auto_agent', 'news_harvest', 'programmatic'));

-- ============================================
-- 8. NEW BLOG CATEGORIES
-- ============================================

-- Insert new categories (idempotent with ON CONFLICT)
INSERT INTO blog_categories (slug, name, description, sort_order) VALUES
  ('news', 'News', 'Daily Dalat news and updates', 4),
  ('places', 'Places', 'Guides to cafes, restaurants, and venues in Dalat', 5),
  ('food', 'Food & Drink', 'Dalat food guides, restaurant reviews, and culinary experiences', 6),
  ('activities', 'Activities', 'Things to do in Dalat — hiking, photography, markets, and more', 7),
  ('neighborhoods', 'Neighborhoods', 'Explore Dalat by neighborhood', 8),
  ('travel', 'Travel', 'Getting to and around Dalat', 9),
  ('culture', 'Culture', 'Local culture, history, and traditions', 10),
  ('seasonal', 'Seasonal', 'Monthly guides and seasonal content', 11)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 9. UPDATE CONTENT TRANSLATIONS CONSTRAINTS
-- ============================================

-- Add 'news_article' to content_type
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_content_type_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_content_type_check
CHECK (content_type IN (
  'event', 'moment', 'profile', 'blog', 'venue', 'comment', 'organizer', 'track',
  'news_article'
));

-- Add 'summary' to field_name
ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_field_name_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_field_name_check
CHECK (field_name IN (
  'title', 'description', 'text_content', 'bio',
  'story_content', 'technical_content', 'meta_description',
  'image_alt', 'image_description',
  'ai_description', 'scene_description', 'video_summary',
  'audio_summary', 'pdf_summary',
  'content',
  'lyrics',
  'summary'
));

-- ============================================
-- 10. RLS POLICIES
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pillar_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;

-- Service role has full access (bypasses RLS automatically)
-- No explicit policies needed for service role

-- Admin read-only on operational tables
CREATE POLICY admin_read_content_queue ON content_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_read_content_sources ON content_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_read_agent_runs ON agent_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_read_keyword_research ON keyword_research
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_read_pillar_pages ON pillar_pages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Public read on published content sources (for transparency)
CREATE POLICY public_read_published_sources ON content_sources
  FOR SELECT
  TO anon
  USING (status = 'published');

-- Public read on trending topics
CREATE POLICY public_read_trending_topics ON trending_topics
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- 11. UPDATED_AT TRIGGERS
-- ============================================

-- Reuse the existing trigger function (set_updated_at or similar)
-- If it doesn't exist, create it
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_content_queue_updated_at
  BEFORE UPDATE ON content_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_content_sources_updated_at
  BEFORE UPDATE ON content_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_keyword_research_updated_at
  BEFORE UPDATE ON keyword_research
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_pillar_pages_updated_at
  BEFORE UPDATE ON pillar_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_trending_topics_updated_at
  BEFORE UPDATE ON trending_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- 12. HELPER RPCS
-- ============================================

-- Get next content queue item for an agent
CREATE OR REPLACE FUNCTION claim_content_queue_item(
  p_agent_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  -- Atomically claim the highest-priority pending item
  UPDATE content_queue
  SET status = 'generating',
      assigned_agent = p_agent_name,
      updated_at = now()
  WHERE id = (
    SELECT id FROM content_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_content_queue_item(text) TO authenticated;

-- Record an agent run
CREATE OR REPLACE FUNCTION start_agent_run(
  p_agent_name text,
  p_inngest_run_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  INSERT INTO agent_runs (agent_name, inngest_run_id, status, started_at)
  VALUES (p_agent_name, p_inngest_run_id, 'running', now())
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION start_agent_run(text, text) TO authenticated;

-- Complete an agent run
CREATE OR REPLACE FUNCTION complete_agent_run(
  p_run_id uuid,
  p_status text DEFAULT 'completed',
  p_items_processed int DEFAULT 0,
  p_items_created int DEFAULT 0,
  p_items_skipped int DEFAULT 0,
  p_errors_count int DEFAULT 0,
  p_output jsonb DEFAULT '{}',
  p_api_calls_claude int DEFAULT 0,
  p_api_calls_google_translate int DEFAULT 0,
  p_api_calls_gemini int DEFAULT 0,
  p_estimated_cost_usd numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_runs
  SET status = p_status,
      completed_at = now(),
      duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000,
      items_processed = p_items_processed,
      items_created = p_items_created,
      items_skipped = p_items_skipped,
      errors_count = p_errors_count,
      output = p_output,
      api_calls_claude = p_api_calls_claude,
      api_calls_google_translate = p_api_calls_google_translate,
      api_calls_gemini = p_api_calls_gemini,
      estimated_cost_usd = p_estimated_cost_usd
  WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_agent_run(uuid, text, int, int, int, int, jsonb, int, int, int, numeric) TO authenticated;

COMMENT ON FUNCTION claim_content_queue_item IS 'Atomically claims the highest-priority pending content queue item for an agent.';
COMMENT ON FUNCTION start_agent_run IS 'Records the start of an agent execution run.';
COMMENT ON FUNCTION complete_agent_run IS 'Records the completion of an agent execution run with metrics.';
