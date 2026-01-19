import type { Metadata } from "next";
import { Github } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { GlobalFooter } from "@/components/global-footer";
import { BlogStoryCard } from "@/components/blog/blog-story-card";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getBlogTranslationsBatch } from "@/lib/translations";
import type { Locale } from "@/lib/i18n/routing";
import type { ContentLocale } from "@/lib/types";
import type { BlogPostWithCategory } from "@/lib/types/blog";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

async function getAboutPosts(): Promise<BlogPostWithCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_blog_posts", {
    p_category_slug: "about",
    p_limit: 10,
    p_offset: 0,
  });

  if (error) {
    console.error("Failed to fetch about posts:", error);
    return [];
  }

  return (data ?? []) as BlogPostWithCategory[];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  return generateLocalizedMetadata({
    locale,
    path: "/about",
    title: "About",
    description:
      "Dalat.app is an open-source community platform for discovering events in Đà Lạt, Vietnam.",
    keywords: ["about", "open source", "community", "Đà Lạt", "Vietnam"],
    type: "website",
  });
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;

  const aboutPosts = await getAboutPosts();

  // Fetch translations
  const postIds = aboutPosts.map((p) => p.id);
  const translations =
    postIds.length > 0
      ? await getBlogTranslationsBatch(postIds, locale as ContentLocale)
      : new Map();

  const translatedPosts = aboutPosts.map((post) => {
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
      { name: "About", url: "/about" },
    ],
    locale
  );

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <SiteHeader />

      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          {/* Header */}
          <header className="mb-12 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-4">
              Dalat.app
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              A community platform for discovering events in Đà Lạt, Vietnam.
              <br />
              Concerts, markets, workshops, and gatherings in the city of eternal spring.
            </p>

            {/* Open source badge - minimal */}
            <a
              href="https://github.com/goldenfocus/dalat-app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>Open source</span>
            </a>
          </header>

          {/* Stories from "about" category */}
          {translatedPosts.length > 0 && (
            <section>
              <div className="grid gap-6">
                {translatedPosts.map((post) => (
                  <BlogStoryCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <GlobalFooter />
    </>
  );
}
