import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { BlogPostGrid } from "@/components/blog/blog-post-grid";
import { CategoryTabs } from "@/components/blog/category-tabs";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getBlogTranslationsBatch } from "@/lib/translations";
import type { Locale } from "@/lib/i18n/routing";
import type { ContentLocale } from "@/lib/types";
import type { BlogPostWithCategory, BlogCategory } from "@/lib/types/blog";

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string }>;
}

async function getBlogPosts(categorySlug?: string): Promise<BlogPostWithCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_blog_posts", {
    p_category_slug: categorySlug || null,
    p_limit: 20,
    p_offset: 0,
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
  const { category: categorySlug } = await searchParams;

  const [posts, categories, t] = await Promise.all([
    getBlogPosts(categorySlug),
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

          {/* Posts Grid */}
          {translatedPosts.length > 0 ? (
            <BlogPostGrid posts={translatedPosts} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noPosts")}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
