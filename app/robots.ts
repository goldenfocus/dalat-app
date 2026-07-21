import type { MetadataRoute } from "next";
import { allLocales } from "@/lib/i18n/config";

/**
 * robots.txt configuration for dalat.app
 *
 * SEO Strategy:
 * - Allow all search engine crawlers AND AI/answer-engine crawlers on all
 *   content (AEO — being cited by ChatGPT/Claude/Perplexity requires access).
 *   AI crawlers read raw HTML only and get the same rules as everyone else.
 * - Protect private/admin routes — in BOTH unprefixed and locale-prefixed
 *   forms: with localePrefix 'as-needed', /vi/settings is a real URL that an
 *   unprefixed "/settings/" rule does not match.
 * - Reference sitemap for comprehensive indexing.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://dalat.app";

  // Routes that exist under locale prefixes too (page routes)
  const privatePages = [
    "/auth/",
    "/admin/",
    "/organizer/",
    "/protected/",
    "/settings/",
    "/invite/", // Private invite links
  ];

  // Root-only technical routes (never locale-prefixed)
  const technicalRoutes = ["/api/", "/_next/"];

  const disallow = [
    ...technicalRoutes,
    ...privatePages,
    ...allLocales.flatMap((locale) => privatePages.map((path) => `/${locale}${path}`)),
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
