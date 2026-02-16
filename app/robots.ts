import type { MetadataRoute } from "next";

/**
 * robots.txt configuration for dalat.app
 *
 * SEO Strategy:
 * - Allow all search engine crawlers
 * - Explicitly welcome AI crawlers (AEO - AI Engine Optimization)
 * - Protect private/admin routes
 * - Reference sitemap for comprehensive indexing
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://dalat.app";

  return {
    rules: [
      {
        // Default rules for all crawlers
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/admin/",
          "/organizer/",
          "/protected/",
          "/settings/",
          "/_next/",
          "/invite/", // Private invite links
        ],
      },
      {
        // Explicitly allow AI crawlers for AEO (AI Engine Optimization)
        // These crawlers power AI assistants like ChatGPT, Claude, Perplexity
        userAgent: [
          "ChatGPT-User",     // OpenAI ChatGPT browse mode
          "GPTBot",           // OpenAI general crawler
          "Claude-Web",       // Anthropic Claude
          "ClaudeBot",        // Anthropic Claude crawler
          "PerplexityBot",    // Perplexity AI
          "Applebot-Extended", // Apple Intelligence
          "GoogleOther",      // Google AI features
          "Google-Extended",  // Google Bard/Gemini
          "cohere-ai",        // Cohere AI
          "anthropic-ai",     // Anthropic
        ],
        allow: [
          "/",
          "/llms.txt",           // Machine-readable site manifest
          "/api/dalat/",         // Public data APIs for AI assistants
          "/blog/rss.xml",       // RSS feed
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/admin/",
          "/organizer/",
          "/protected/",
          "/settings/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
