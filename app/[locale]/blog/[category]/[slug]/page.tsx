import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Languages, RefreshCw, ShieldAlert } from "lucide-react";
import { BlogCoverImage } from "@/components/blog/blog-cover-image";
import { GeneratedCover } from "@/components/blog/generated-cover";
import { createStaticClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { BlogShareButtons } from "@/components/blog/blog-share-buttons";
import { TechnicalAccordion } from "@/components/blog/technical-accordion";
import { CtaButton } from "@/components/blog/cta-button";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateBlogArticleSchema } from "@/lib/structured-data";
import { NewsSourcesSection } from "@/components/news/news-sources-section";
import { generateNewsArticleSchema } from "@/lib/structured-data";
import { getBlogTranslations } from "@/lib/translations";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/server-cache";
import type { Locale } from "@/lib/i18n/routing";
import type { ContentLocale } from "@/lib/types";
import type { BlogPostFull } from "@/lib/types/blog";
import {
  getBlogTranslationCutoff,
  getNewsPageModifiedAt,
} from "@/lib/news/article-policy";

interface PageProps {
  params: Promise<{ locale: Locale; category: string; slug: string }>;
}

interface NewsSourceUrl {
  url: string;
  title: string;
  publisher: string;
  published_at: string | null;
  retrieved_at?: string;
  content_updated_at?: string;
}

interface NewsSourceImage {
  original_url: string;
  stored_url: string;
  attribution: string;
  alt: string;
}

type BlogPostWithNewsExtras = BlogPostFull & {
  source_urls?: NewsSourceUrl[];
  source_images?: NewsSourceImage[];
  updated_at?: string;
};

function normalizeNewsSources(value: unknown): NewsSourceUrl[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source) => {
    const record = typeof source === "string"
      ? { url: source }
      : typeof source === "object" && source !== null && !Array.isArray(source)
        ? source as Record<string, unknown>
        : null;
    if (!record || typeof record.url !== "string") return [];
    try {
      const parsed = new URL(record.url);
      if (!/^https?:$/u.test(parsed.protocol)) return [];
      return [{
        url: parsed.toString(),
        title: typeof record.title === "string" ? record.title : parsed.hostname,
        publisher: typeof record.publisher === "string" ? record.publisher : parsed.hostname,
        published_at: typeof record.published_at === "string" ? record.published_at : null,
        retrieved_at: typeof record.retrieved_at === "string" ? record.retrieved_at : undefined,
        content_updated_at: typeof record.content_updated_at === "string"
          ? record.content_updated_at
          : undefined,
      }];
    } catch {
      return [];
    }
  });
}

function hasAutomatedNewsProvenance(post: BlogPostWithNewsExtras): boolean {
  return post.source === "news_scrape" && (post.source_urls?.length ?? 0) > 0;
}

/**
 * Cached blog post fetcher - uses static client for ISR compatibility.
 * Revalidates every 5 minutes.
 */
const getCachedBlogPost = unstable_cache(
  async (slug: string): Promise<BlogPostWithNewsExtras | null> => {
    const supabase = createStaticClient();
    if (!supabase) return null;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceClient = serviceRoleKey && supabaseUrl
      ? createSupabaseClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    const { data, error } = await supabase.rpc("get_blog_post_by_slug", {
      p_slug: slug,
    });

    if (error) {
      console.error("[blog-post] Public detail lookup failed:", error);
    }

    let post = data?.[0] as BlogPostWithNewsExtras | undefined;

    // The deployed RPC currently limits experimental visibility to the News
    // category. Corrections must retain old categories, so a demoted legacy
    // news_scrape URL needs this narrowly scoped server-only fallback until a
    // migration can harden the RPC predicate. Drafts and manual experiments
    // remain private.
    if (!post && serviceClient) {
      const { data: fallback, error: fallbackError } = await serviceClient
        .from("blog_posts")
        .select(`
          id, slug, title, story_content, technical_content,
          cover_image_url, cover_image_alt, cover_image_description,
          cover_image_keywords, cover_image_colors,
          suggested_cta_url, suggested_cta_text,
          meta_description, social_share_text, seo_keywords,
          related_feature_slugs, version, source, published_at, created_at,
          source_urls, source_images, updated_at,
          blog_categories(slug, name)
        `)
        .eq("slug", slug)
        .eq("source", "news_scrape")
        .eq("status", "experimental")
        .maybeSingle();

      if (fallbackError) {
        console.error("[blog-post] Experimental automation fallback failed:", fallbackError);
      } else if (fallback) {
        const categories = fallback.blog_categories;
        const category = Array.isArray(categories) ? categories[0] : categories;
        const { count: likeCount } = await serviceClient
          .from("blog_post_likes")
          .select("*", { count: "exact", head: true })
          .eq("post_id", fallback.id);
        post = {
          ...fallback,
          category_slug: category?.slug ?? null,
          category_name: category?.name ?? null,
          like_count: likeCount ?? 0,
        } as BlogPostWithNewsExtras;
      }
    }

    if (!post) return null;

    // Modification time is not in the RPC return table. News source metadata
    // lives on the same table, so fetch the public row once for both concerns.
    // Read extras server-side only after the public RPC or the exact
    // source=news_scrape/status=experimental fallback authorized this ID.
    const extrasClient = serviceClient ?? supabase;
    const { data: extras, error: extrasError } = await extrasClient
      .from("blog_posts")
      .select("source_urls, source_images, updated_at")
      .eq("id", post.id)
      .maybeSingle();

    if (extrasError) {
      console.error("[blog-post] Failed to fetch post metadata:", extrasError);
    }

    if (extras) {
      post.updated_at = extras.updated_at ?? undefined;
      if (post.category_slug === "news" || post.source === "news_scrape") {
        post.source_urls = normalizeNewsSources(extras.source_urls);
        post.source_images = extras.source_images ?? [];
      }
    }

    return post;
  },
  ["blog-post-by-slug"],
  {
    revalidate: 300, // 5 minutes
    tags: [CACHE_TAGS.blog],
  }
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getCachedBlogPost(slug);

  if (!post) {
    return { title: "Post not found" };
  }

  const freshAfter = getBlogTranslationCutoff(post);
  const pageModifiedAt = post.source === "news_scrape"
    ? getNewsPageModifiedAt(post)
    : post.updated_at;
  const translations = await getBlogTranslations(
    post.id,
    locale as ContentLocale,
    {
      title: post.title,
      story_content: post.story_content,
      technical_content: post.technical_content,
      meta_description: post.meta_description,
      source_locale: (post as BlogPostFull & { source_locale?: string }).source_locale,
      fresh_after: freshAfter,
    }
  );

  return generateLocalizedMetadata({
    locale,
    path: `/blog/${post.category_slug || "changelog"}/${slug}`,
    title: translations.translated_title,
    description: translations.translated_meta_description
      || translations.translated_story_content.slice(0, 160),
    keywords: post.seo_keywords || [],
    type: "article",
    image: post.cover_image_url || undefined,
    publishedTime: post.published_at || undefined,
    modifiedTime: pageModifiedAt || undefined,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, category, slug } = await params;
  const post = await getCachedBlogPost(slug);

  if (!post) {
    notFound();
  }

  // Category is part of the canonical URL. Preserve locale while permanently
  // consolidating old category paths onto the current one.
  const actualCategory = post.category_slug || "changelog";
  if (category !== actualCategory) {
    permanentRedirect(localeUrl(locale, `/blog/${actualCategory}/${slug}`));
  }

  const t = await getTranslations("blog");
  const newsContentFreshAfter = getBlogTranslationCutoff(post);
  const pageModifiedAt = post.source === "news_scrape"
    ? getNewsPageModifiedAt(post)
    : post.updated_at;

  // Fetch translations for this blog post
  const translations = await getBlogTranslations(
    post.id,
    locale as ContentLocale,
    {
      title: post.title,
      story_content: post.story_content,
      technical_content: post.technical_content,
      meta_description: post.meta_description,
      source_locale: (post as BlogPostFull & { source_locale?: string }).source_locale,
      fresh_after: newsContentFreshAfter,
    }
  );

  const publishedDate = post.published_at
    ? new Date(post.published_at)
    : new Date(post.created_at);
  const factualUpdatedAt = newsContentFreshAfter || post.updated_at;
  const updatedDate = factualUpdatedAt ? new Date(factualUpdatedAt) : null;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const formattedUpdatedDate = updatedDate
    && Number.isFinite(updatedDate.getTime())
    && updatedDate.getTime() - publishedDate.getTime() >= 60_000
      ? dateFormatter.format(updatedDate)
      : null;
  const visibleSources = (post.source_urls ?? []).map((source) => {
    const retrievedDate = source.retrieved_at ? new Date(source.retrieved_at) : null;
    return {
      ...source,
      checkedLabel: retrievedDate && Number.isFinite(retrievedDate.getTime())
        ? t("sourceChecked", { date: dateFormatter.format(retrievedDate) })
        : undefined,
    };
  });

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
      { name: post.category_name || "Changelog", url: `/blog?category=${actualCategory}` },
      { name: translations.translated_title, url: `/blog/${actualCategory}/${slug}` },
    ],
    locale
  );

  const localizedPost = {
    ...post,
    title: translations.translated_title,
    story_content: translations.translated_story_content,
    technical_content: translations.translated_technical_content,
    meta_description: translations.translated_meta_description,
    updated_at: pageModifiedAt || factualUpdatedAt || undefined,
  };
  const articleSchema = (post.category_slug === 'news' || hasAutomatedNewsProvenance(post))
    ? generateNewsArticleSchema(
        {
          ...localizedPost,
          source_urls: post.source_urls ?? [],
          news_tags: [],
        },
        locale
      )
    : generateBlogArticleSchema(localizedPost, locale);

  // Source images woven into the article body (skip the cover, max 2)
  const inlineImages = (post.source_images ?? [])
    .filter(
      (img) => img?.stored_url && img.stored_url !== post.cover_image_url
    )
    .slice(0, 2)
    .map((img) => ({
      url: img.stored_url,
      alt: img.alt || undefined,
      attribution: img.attribution || undefined,
    }));

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <main className="min-h-screen bg-background">
        <article className="mx-auto max-w-3xl px-4 py-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-6 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("backToBlog")}</span>
          </Link>

          {/* Cover Image */}
          {post.cover_image_url ? (
            <BlogCoverImage
              src={post.cover_image_url}
              alt={translations.translated_title}
            />
          ) : (
            <GeneratedCover
              title={translations.translated_title}
              seed={slug}
              categoryLabel={post.category_name ?? undefined}
              className="w-full rounded-xl mb-8"
            />
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
            {post.version && (
              <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
                v{post.version}
              </span>
            )}
            {post.category_name && (
              <span className="text-xs uppercase tracking-wide font-medium text-primary">
                {post.category_name}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {dateFormatter.format(publishedDate)}
            </span>
            {formattedUpdatedDate && (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                {t("updated", { date: formattedUpdatedDate })}
              </span>
            )}
            {translations.is_translated && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <Languages className="w-3 h-3" />
                {t("translated")}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">
            {translations.translated_title}
          </h1>

          {/* Story Content (Human-readable) */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
            <MarkdownRenderer
              content={translations.translated_story_content}
              inlineImages={inlineImages.length > 0 ? inlineImages : undefined}
            />
          </div>

          {/* Put evidence next to the reporting, before promotional/share UI. */}
          {visibleSources.length > 0 && (
            <NewsSourcesSection
              label={t("sources")}
              sources={visibleSources}
            />
          )}
          {post.source === "news_scrape" && visibleSources.length === 0 && (
            <div className="mt-8 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>{t("sourceVerificationPending")}</p>
            </div>
          )}

          {/* CTA Button */}
          {post.suggested_cta_url && (
            <CtaButton
              url={post.suggested_cta_url}
              text={post.suggested_cta_text || "Try it now"}
            />
          )}

          {/* Divider */}
          <hr className="my-8 border-border" />

          {/* Share */}
          <div className="flex items-center justify-center mb-8">
            <BlogShareButtons
              title={translations.translated_title}
              url={`/blog/${actualCategory}/${slug}`}
              shareText={post.social_share_text}
            />
          </div>

          {/* Optional supporting detail. The complete guide belongs above. */}
          {translations.translated_technical_content.trim() && (
            <TechnicalAccordion content={translations.translated_technical_content} />
          )}

          {/* Related Posts (future) */}
          {/* {post.related_feature_slugs.length > 0 && (
            <RelatedPosts slugs={post.related_feature_slugs} />
          )} */}
        </article>
      </main>
    </>
  );
}
