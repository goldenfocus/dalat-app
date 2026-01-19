import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { BlogShareButtons } from "@/components/blog/blog-share-buttons";
import { TechnicalAccordion } from "@/components/blog/technical-accordion";
import { CtaButton } from "@/components/blog/cta-button";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateBlogArticleSchema } from "@/lib/structured-data";
import type { Locale } from "@/lib/i18n/routing";
import type { BlogPostFull } from "@/lib/types/blog";

interface PageProps {
  params: Promise<{ locale: Locale; category: string; slug: string }>;
}

async function getBlogPost(slug: string): Promise<BlogPostFull | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_blog_post_by_slug", {
    p_slug: slug,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0] as BlogPostFull;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getBlogPost(slug);

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
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

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
      { name: post.title, url: `/blog/${actualCategory}/${slug}` },
    ],
    locale
  );

  const articleSchema = generateBlogArticleSchema(post, locale);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <SiteHeader />

      <main className="min-h-screen bg-background">
        <article className="mx-auto max-w-3xl px-4 py-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-6 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Blog</span>
          </Link>

          {/* Cover Image */}
          {post.cover_image_url && (
            <div className="relative aspect-[2/1] rounded-xl overflow-hidden mb-8 bg-muted">
              <Image
                src={post.cover_image_url}
                alt={post.title}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, 768px"
              />
            </div>
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
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">
            {post.title}
          </h1>

          {/* Story Content (Human-readable) */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
            <MarkdownRenderer content={post.story_content} />
          </div>

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
              title={post.title}
              url={`/blog/${actualCategory}/${slug}`}
              shareText={post.social_share_text}
            />
          </div>

          {/* Technical Details Accordion */}
          <TechnicalAccordion content={post.technical_content} />

          {/* Related Posts (future) */}
          {/* {post.related_feature_slugs.length > 0 && (
            <RelatedPosts slugs={post.related_feature_slugs} />
          )} */}
        </article>
      </main>
    </>
  );
}
