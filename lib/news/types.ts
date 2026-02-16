/**
 * DaLat News Aggregation System - Core Types
 */

export interface NewsSource {
  id: string;
  name: string;
  baseUrl: string;
  discoveryUrl: string;
  /** CSS selectors or patterns for article extraction */
  selectors: {
    articleList: string;
    articleLink: string;
    title: string;
    content: string;
    image: string;
    date: string;
    author?: string;
  };
  /** Maximum articles per scrape run */
  maxArticles: number;
  /** Delay between requests in ms */
  requestDelay: number;
}

export interface ScrapedArticle {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  content: string;
  imageUrls: string[];
  publishedAt: string | null;
}

export interface ArticleCluster {
  clusterId: string;
  topicFingerprint: string;
  keywords: string[];
  articles: ScrapedArticle[];
}

export interface NewsProcessResult {
  scraped: number;
  newArticles: number;
  duplicatesSkipped: number;
  errors: number;
  errorMessages: string[];
}

export interface NewsContentOutput {
  title: string;
  storyContent: string;
  technicalContent: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedSlug: string;
  newsTags: string[];
  newsTopic: string;
  /** AI-generated image descriptions for fallback cover image generation */
  imageDescriptions: string[];
  sourceUrls: Array<{
    url: string;
    title: string;
    publisher: string;
    published_at: string | null;
  }>;
  internalLinks: Array<{
    text: string;
    url: string;
    type: 'event' | 'venue' | 'location';
  }>;
  qualityFactors: {
    sourceCount: number;
    hasDates: boolean;
    hasNamedSources: boolean;
    hasImages: boolean;
    contentLength: number;
    dalatRelevance: number;
  };
}

export interface QualityScore {
  total: number;
  breakdown: {
    sourceCount: number;
    dalatRelevance: number;
    newsworthiness: number;
    contentLength: number;
    hasDates: number;
    hasNamedSources: number;
    hasImages: number;
    originality: number;
  };
  suggestedStatus: 'published' | 'experimental' | 'draft';
}
