import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Languages } from "lucide-react";
import { BlogCoverImage } from "@/components/blog/blog-cover-image";
import { format } from "date-fns";
import { createStaticClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { BlogShareButtons } from "@/components/blog/blog-share-buttons";
import { TechnicalAccordion } from "@/components/blog/technical-accordion";
import { CtaButton } from "@/components/blog/cta-button";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { PillarTemplate } from "@/components/blog/pillar-template";
import { NewsTemplate } from "@/components/blog/news-template";
import { MonthlyTemplate } from "@/components/blog/monthly-template";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateBlogArticleSchema } from "@/lib/structured-data";
import { getBlogTranslations } from "@/lib/translations";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/server-cache";
import type { Locale } from "@/lib/i18n/routing";
import type { ContentLocale } from "@/lib/types";
import type { BlogPostFull } from "@/lib/types/blog";
import type { BlogPostContentType } from "@/lib/types/blog";

interface PageProps {
  params: Promise<{ locale: Locale; category: string; slug: string }>;
}

/**
 * Cached blog post fetcher - uses static client for ISR compatibility.
 * Revalidates every 5 minutes.
 */
const getCachedBlogPost = unstable_cache(
  async (slug: string): Promise<BlogPostFull | null> => {
    const supabase = createStaticClient();
    if (!supabase) return null;

    const { data, error } = await supabase.rpc("get_blog_post_by_slug", {
      p_slug: slug,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    return data[0] as BlogPostFull;
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

  return generateLocalizedMetadata({
    locale,
    path: `/blog/${post.category_slug || "changelog"}/${slug}`,
    title: post.title,
    description: post.meta_description || post.story_content.slice(0, 160),
    keywords: post.seo_keywords || [],
    type: "article",
    image: post.cover_image_url || undefined,
    publishedTime: post.published_at || undefined,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, category, slug } = await params;
  const post = await getCachedBlogPost(slug);

  if (!post) {
    notFound();
  }

  const t = await getTranslations("blog");

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
    }
  );

  // Verify category matches (or redirect)
  const actualCategory = post.category_slug || "changelog";
  if (category !== actualCategory) {
    // Could redirect here, but for now just show the post
  }

  const publishedDate = post.published_at
    ? new Date(post.published_at)
    : new Date(post.created_at);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
      { name: post.category_name || "Changelog", url: `/blog?category=${actualCategory}` },
      { name: translations.translated_title, url: `/blog/${actualCategory}/${slug}` },
    ],
    locale
  );

  const articleSchema = generateBlogArticleSchema(post, locale);

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
          {post.cover_image_url && (
            <BlogCoverImage
              src={post.cover_image_url}
              alt={translations.translated_title}
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
              {format(publishedDate, "MMMM d, yyyy")}
            </span>
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

          {/* Content — template varies by content_type */}
          <BlogContent
            contentType={(post as BlogPostFull & { content_type?: BlogPostContentType }).content_type}
            storyContent={translations.translated_story_content}
            technicalContent={translations.translated_technical_content}
            post={post}
            slug={slug}
            actualCategory={actualCategory}
            translations={translations}
          />
        </article>
      </main>
    </>
  );
}

/**
 * Renders content based on blog post type.
 * Pillar pages get TOC sidebar + FAQ, news gets source attribution,
 * monthly/programmatic gets weather card. Default gets the standard layout.
 */
function BlogContent({
  contentType,
  storyContent,
  technicalContent,
  post,
  slug,
  actualCategory,
  translations,
}: {
  contentType?: BlogPostContentType;
  storyContent: string;
  technicalContent: string;
  post: BlogPostFull;
  slug: string;
  actualCategory: string;
  translations: { translated_title: string; translated_story_content: string; translated_technical_content: string };
}) {
  const extPost = post as BlogPostFull & {
    faq_data?: Array<{ question: string; answer: string }>;
    reading_time_minutes?: number;
    data_freshness_at?: string;
    internal_links?: string[];
  };

  // Pillar pages: TOC + FAQ + related guides
  if (contentType === "pillar") {
    return (
      <>
        <PillarTemplate
          storyContent={storyContent}
          faqData={extPost.faq_data}
          readingTime={extPost.reading_time_minutes}
          lastUpdated={extPost.data_freshness_at}
          internalLinks={extPost.internal_links}
        />
        <hr className="my-8 border-border" />
        <div className="flex items-center justify-center mb-8">
          <BlogShareButtons
            title={translations.translated_title}
            url={`/blog/${actualCategory}/${slug}`}
            shareText={post.social_share_text}
          />
        </div>
        <TechnicalAccordion content={technicalContent} />
      </>
    );
  }

  // News articles: source attribution + compact layout
  if (contentType === "news") {
    return (
      <>
        <NewsTemplate
          storyContent={storyContent}
          source={post.source ?? undefined}
          publishedAt={post.published_at ?? undefined}
        />
        <hr className="my-8 border-border" />
        <div className="flex items-center justify-center mb-8">
          <BlogShareButtons
            title={translations.translated_title}
            url={`/blog/${actualCategory}/${slug}`}
            shareText={post.social_share_text}
          />
        </div>
      </>
    );
  }

  // Monthly/programmatic guides: weather card + FAQ
  if (contentType === "programmatic") {
    // Extract month name from slug (e.g., "dalat-in-january" -> "January")
    const monthMatch = slug.match(/in-(\w+)$/);
    const month = monthMatch
      ? monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1)
      : undefined;

    return (
      <>
        <MonthlyTemplate
          storyContent={storyContent}
          month={month}
          faqData={extPost.faq_data}
        />
        <hr className="my-8 border-border" />
        <div className="flex items-center justify-center mb-8">
          <BlogShareButtons
            title={translations.translated_title}
            url={`/blog/${actualCategory}/${slug}`}
            shareText={post.social_share_text}
          />
        </div>
        <TechnicalAccordion content={technicalContent} />
      </>
    );
  }

  // Default layout (blog, guide, place)
  return (
    <>
      <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
        <MarkdownRenderer content={storyContent} />
      </div>

      {post.suggested_cta_url && (
        <CtaButton
          url={post.suggested_cta_url}
          text={post.suggested_cta_text || "Try it now"}
        />
      )}

      <hr className="my-8 border-border" />

      <div className="flex items-center justify-center mb-8">
        <BlogShareButtons
          title={translations.translated_title}
          url={`/blog/${actualCategory}/${slug}`}
          shareText={post.social_share_text}
        />
      </div>

      <TechnicalAccordion content={technicalContent} />
    </>
  );
}
