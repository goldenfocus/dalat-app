// ============================================
// Blog System Types
// Human-First, Machine-Complete content model
// ============================================

export type BlogPostSource = 'github_release' | 'manual' | 'daily_summary' | 'auto_agent' | 'news_harvest' | 'programmatic';
export type BlogPostStatus = 'draft' | 'experimental' | 'published' | 'deprecated' | 'archived';

export interface BlogCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: string;

  // Source tracking
  source: BlogPostSource;
  github_release_id: number | null;
  version: string | null;

  // Category
  category_id: string | null;

  // Human Content (story-driven)
  title: string;
  story_content: string;
  cover_image_url: string | null;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;

  // Cover Image Metadata (SEO/AEO/GEO)
  cover_image_alt: string | null;
  cover_image_description: string | null;
  cover_image_keywords: string[] | null;
  cover_image_colors: string[] | null;

  // Machine Content (SEO/AI)
  technical_content: string;
  seo_keywords: string[];
  related_feature_slugs: string[];

  // Meta
  slug: string;
  meta_description: string | null;
  social_share_text: string | null;

  // Status
  status: BlogPostStatus;
  published_at: string | null;

  // Daily summary metadata (Lane A)
  summary_date: string | null;
  areas_changed: string[] | null;

  created_at: string;
  updated_at: string;

  // Joined data
  blog_categories?: BlogCategory;
}

// Blog post with category info (from RPC functions)
export interface BlogPostWithCategory {
  id: string;
  slug: string;
  title: string;
  story_content: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_image_description: string | null;
  cover_image_keywords: string[] | null;
  cover_image_colors: string[] | null;
  version: string | null;
  source: BlogPostSource;
  published_at: string | null;
  category_slug: string | null;
  category_name: string | null;
  like_count: number;
}

// Full blog post data (from get_blog_post_by_slug)
export interface BlogPostFull extends BlogPostWithCategory {
  technical_content: string;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;
  meta_description: string | null;
  social_share_text: string | null;
  seo_keywords: string[];
  related_feature_slugs: string[];
  created_at: string;
}

// Like status for a blog post
export interface BlogPostLikeStatus {
  post_id: string;
  liked: boolean;
  count: number;
}

// ============================================
// AI Content Generation Types
// ============================================

// Input to the AI content generator
export interface BlogContentGeneratorInput {
  title: string;
  body: string;
  category: string;
  version?: string;
}

// Output from the AI content generator
export interface BlogContentGeneratorOutput {
  // Human version
  story_content: string;
  suggested_image_descriptions: string[];

  // Machine version
  technical_content: string;
  seo_keywords: string[];
  related_features: string[];
  has_breaking_changes: boolean;

  // Meta
  suggested_slug: string;
  meta_description: string;
  social_share_text: string;
  suggested_cta_url: string | null;
  suggested_cta_text: string;
}

// ============================================
// GitHub Webhook Types
// ============================================

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
}

export interface GitHubReleaseWebhookPayload {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: GitHubRelease;
  repository: {
    id: number;
    name: string;
    full_name: string;
  };
}

// ============================================
// Machine-Readable API Types
// ============================================

export interface BlogPostRawResponse {
  article: {
    title: string;
    version: string | null;
    published: string | null;
    category: string | null;
    slug: string;
  };
  content: {
    human_markdown: string;
    technical_markdown: string;
    keywords: string[];
    related: string[];
  };
  structured_data: Record<string, unknown>;
}

// ============================================
// RSS Feed Types
// ============================================

export interface RssFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  category?: string;
}

// ============================================
// SEO Content Pipeline Types
// ============================================

export type BlogPostContentType = 'blog' | 'pillar' | 'news' | 'place' | 'guide' | 'programmatic';

export type ContentQueueType =
  | 'news' | 'guide' | 'pillar' | 'event_preview' | 'event_recap'
  | 'monthly_guide' | 'activity_guide' | 'trend_report';

export type ContentQueueStatus =
  | 'pending' | 'generating' | 'draft' | 'reviewing'
  | 'approved' | 'published' | 'rejected';

export interface ContentQueueItem {
  id: string;
  content_type: ContentQueueType;
  title: string;
  brief: string | null;
  source_urls: string[];
  source_data: Record<string, unknown>;
  assigned_agent: string | null;
  priority: number;
  target_keywords: string[];
  status: ContentQueueStatus;
  blog_post_id: string | null;
  quality_score: number | null;
  revision_notes: string | null;
  revision_count: number;
  scheduled_publish_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentSourcePlatform =
  | 'vnexpress' | 'tuoitre' | 'thanhnien' | 'lamdong_gov'
  | 'google_news' | 'facebook' | 'instagram' | 'tiktok';

export type ContentSourceCategory =
  | 'news' | 'event' | 'social' | 'travel' | 'business' | 'weather' | 'government';

export type ContentSourceStatus =
  | 'raw' | 'classified' | 'enriched' | 'published' | 'duplicate' | 'rejected';

export interface ContentSource {
  id: string;
  source_platform: ContentSourcePlatform;
  source_url: string;
  source_url_hash: string;
  raw_title: string | null;
  raw_content: string | null;
  raw_html: string | null;
  raw_images: string[];
  raw_publish_date: string | null;
  content_category: ContentSourceCategory | null;
  relevance_score: number | null;
  quality_score: number | null;
  ai_summary: string | null;
  ai_tags: string[];
  named_entities: Record<string, unknown>;
  is_duplicate: boolean;
  canonical_source_id: string | null;
  status: ContentSourceStatus;
  created_at: string;
  updated_at: string;
}

export type SearchIntent = 'informational' | 'navigational' | 'commercial' | 'transactional';

export interface KeywordResearch {
  id: string;
  keyword: string;
  keyword_locale: string;
  search_volume_estimate: number | null;
  difficulty_estimate: number | null;
  search_intent: SearchIntent | null;
  current_rank: number | null;
  current_url: string | null;
  content_exists: boolean;
  topic_cluster: string | null;
  is_long_tail: boolean;
  rank_history: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'skipped';

export interface AgentRun {
  id: string;
  agent_name: string;
  inngest_run_id: string | null;
  status: AgentRunStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  items_processed: number;
  items_created: number;
  items_skipped: number;
  errors_count: number;
  output: Record<string, unknown>;
  api_calls_claude: number;
  api_calls_google_translate: number;
  api_calls_gemini: number;
  estimated_cost_usd: number;
  created_at: string;
}

export interface PillarPage {
  id: string;
  blog_post_id: string;
  slug: string;
  topic_cluster: string;
  target_keyword: string;
  target_word_count: number;
  data_sources: Record<string, unknown>;
  last_refreshed_at: string | null;
  refresh_frequency_days: number;
  needs_refresh: boolean;
  current_rank: number | null;
  monthly_traffic: number | null;
  created_at: string;
  updated_at: string;
}

export type TrendingTopicCategory =
  | 'food' | 'cafe' | 'nature' | 'nightlife' | 'culture' | 'weather'
  | 'music' | 'art' | 'travel' | 'business' | 'festival' | 'other';

export interface TrendingTopic {
  id: string;
  topic_name: string;
  topic_slug: string;
  topic_category: TrendingTopicCategory | null;
  mention_count: number;
  engagement_score: number;
  trend_velocity: number;
  window_start: string;
  window_end: string;
  source_counts: Record<string, number>;
  related_venue_ids: string[];
  related_event_ids: string[];
  ai_summary: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Extended blog post with new SEO fields
export interface BlogPostWithSEO extends BlogPost {
  content_type: BlogPostContentType;
  pillar_page_id: string | null;
  word_count: number | null;
  reading_time_minutes: number | null;
  internal_links: string[];
  faq_data: Array<{ question: string; answer: string }> | null;
  data_freshness_at: string | null;
  auto_generated: boolean;
}
