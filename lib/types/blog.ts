// ============================================
// Blog System Types
// Human-First, Machine-Complete content model
// ============================================

export type BlogPostSource = 'github_release' | 'manual' | 'daily_summary' | 'news_scrape';
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

// ============================================
// News System Types
// ============================================

export const NEWS_TAGS = [
  'tourism',
  'culture',
  'events',
  'government',
  'food-drink',
  'weather',
  'community',
] as const;

export type NewsTag = typeof NEWS_TAGS[number];

// News post with category - extends base blog post with news-specific fields
export interface NewsPostWithCategory extends BlogPostWithCategory {
  source_urls: Array<{
    url: string;
    title: string;
    publisher: string;
    published_at: string | null;
  }>;
  source_images: Array<{
    original_url: string;
    stored_url: string;
    attribution: string;
    alt: string;
  }>;
  quality_score: number;
  is_featured: boolean;
  is_breaking: boolean;
  news_tags: string[];
  news_topic: string | null;
  related_event_ids: string[];
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
