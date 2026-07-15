import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { BlogPostGrid } from "@/components/blog/blog-post-grid";
import { CategoryTabs } from "@/components/blog/category-tabs";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getBlogTranslationsBatch } from "@/lib/translations";
import { groupByRecency } from "@/lib/blog/date-groups";
import type { Locale } from "@/lib/i18n/routing";
import type { ContentLocale } from "@/lib/types";
import type { BlogPostWithCategory, BlogCategory } from "@/lib/types/blog";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string; page?: string }>;
}

async function getBlogPosts(
  categorySlug: string | undefined,
  offset: number
): Promise<BlogPostWithCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_blog_posts", {
    p_category_slug: categorySlug || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.error("Failed to fetch blog posts:", error);
    return [];
  }

  return (data ?? []) as BlogPostWithCategory[];
}

async function getCategories(): Promise<BlogCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_categories")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error("Failed to fetch categories:", error);
    return [];
  }

  return data ?? [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const meta = await generateLocalizedMetadata({
    locale,
    path: "/blog",
    title: "Blog",
    description: "Product updates, release notes, and stories from the ĐàLạt.app team.",
    keywords: ["dalat", "blog", "changelog", "updates", "release notes"],
    type: "website",
  });

  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      types: {
        "application/rss+xml": "https://dalat.app/blog/rss.xml",
        "application/feed+json": "https://dalat.app/blog/feed.json",
      },
    },
  };
}

export default async function BlogPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { category: categorySlug, page: pageParam } = await searchParams;

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [posts, categories, t] = await Promise.all([
    getBlogPosts(categorySlug, offset),
    getCategories(),
    getTranslations("blog"),
  ]);

  // Fetch translations for all posts in a single query
  const postIds = posts.map((p) => p.id);
  const translations = postIds.length > 0
    ? await getBlogTranslationsBatch(postIds, locale as ContentLocale)
    : new Map();

  // Apply translations to posts
  const translatedPosts = posts.map((post) => {
    const translation = translations.get(post.id);
    return {
      ...post,
      title: translation?.title || post.title,
      story_content: translation?.story_content || post.story_content,
    };
  });

  // Group posts by recency (Vietnam-time day boundaries)
  const groupedPosts = groupByRecency(translatedPosts, (p) => p.published_at);

  const hasOlderPage = posts.length === PAGE_SIZE;
  const buildPageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (categorySlug) query.set("category", categorySlug);
    if (targetPage > 1) query.set("page", String(targetPage));
    const qs = query.toString();
    return qs ? `/blog?${qs}` : "/blog";
  };

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
    ],
    locale
  );

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
            <p className="text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>

          {/* Category Tabs */}
          <CategoryTabs
            categories={categories}
            activeCategory={categorySlug}
            allLabel={t("allPosts")}
          />

          {/* Posts, grouped by recency */}
          {groupedPosts.length > 0 ? (
            <div className="space-y-10">
              {groupedPosts.map((group) => (
                <section key={group.key}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    {t(group.key)}
                  </h2>
                  <BlogPostGrid posts={group.items} />
                </section>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noPosts")}</p>
            </div>
          )}

          {/* Pagination */}
          {(page > 1 || hasOlderPage) && (
            <nav className="flex items-center justify-between mt-10">
              {page > 1 ? (
                <Link
                  href={buildPageHref(page - 1)}
                  className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{t("newerPosts")}</span>
                </Link>
              ) : (
                <span />
              )}
              {hasOlderPage && (
                <Link
                  href={buildPageHref(page + 1)}
                  className="-mr-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
                >
                  <span>{t("olderPosts")}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </nav>
          )}
        </div>
      </main>
    </>
  );
}
