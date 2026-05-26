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
        // AI crawlers: allow content pages only, block dynamic/expensive routes
        // that trigger server-side functions and cause invocation spikes
        userAgent: [
          "ChatGPT-User",
          "GPTBot",
          "Claude-Web",
          "ClaudeBot",
          "PerplexityBot",
          "Applebot-Extended",
          "GoogleOther",
          "Google-Extended",
          "cohere-ai",
          "anthropic-ai",
        ],
        allow: ["/blog/", "/events/", "/about", "/faq", "/contact"],
        disallow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
