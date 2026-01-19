import type { Metadata } from "next";
import { Github, Heart, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { GlobalFooter } from "@/components/global-footer";
import { BlogStoryCard } from "@/components/blog/blog-story-card";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getBlogTranslationsBatch } from "@/lib/translations";
import { Link } from "@/lib/i18n/routing";
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

async function getLatestPost(): Promise<BlogPostWithCategory | null> {
  const supabase = await createClient();

  // Get latest post from any category except "about"
  const { data, error } = await supabase.rpc("get_blog_posts", {
    p_category_slug: null,
    p_limit: 5,
    p_offset: 0,
  });

  if (error) {
    console.error("Failed to fetch latest post:", error);
    return null;
  }

  // Filter out "about" posts and return the first non-about post
  const posts = (data ?? []) as BlogPostWithCategory[];
  return posts.find((p) => p.category_slug !== "about") ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  return generateLocalizedMetadata({
    locale,
    path: "/about",
    title: "About",
    description:
      "Dalat.app is an open-source community platform for discovering events in Đà Lạt, Vietnam. Learn about our story, team, and mission.",
    keywords: ["about", "open source", "community", "team", "mission"],
    type: "website",
  });
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;

  const [aboutPosts, latestPost] = await Promise.all([
    getAboutPosts(),
    getLatestPost(),
  ]);

  // Fetch translations for all posts
  const allPostIds = [
    ...aboutPosts.map((p) => p.id),
    ...(latestPost ? [latestPost.id] : []),
  ];
  const translations =
    allPostIds.length > 0
      ? await getBlogTranslationsBatch(allPostIds, locale as ContentLocale)
      : new Map();

  // Apply translations
  const translatedAboutPosts = aboutPosts.map((post) => {
    const translation = translations.get(post.id);
    return {
      ...post,
      title: translation?.title || post.title,
      story_content: translation?.story_content || post.story_content,
    };
  });

  const translatedLatestPost = latestPost
    ? {
        ...latestPost,
        title: translations.get(latestPost.id)?.title || latestPost.title,
        story_content:
          translations.get(latestPost.id)?.story_content ||
          latestPost.story_content,
      }
    : null;

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
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Hero Section - Static, always visible */}
          <section className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight mb-4">
              About Dalat.app
            </h1>

            <div className="rounded-xl border bg-card p-6 space-y-4">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Dalat.app is a community platform for discovering events in Đà
                Lạt, Vietnam. We help locals and visitors find concerts, markets,
                workshops, and gatherings happening in the city of eternal spring.
              </p>

              <p className="text-muted-foreground leading-relaxed flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500 shrink-0" />
                <span>
                  Built with love by a small team who believes in open-source
                  software and community-driven development.
                </span>
              </p>

              {/* Open Source callout */}
              <div className="pt-4 border-t">
                <a
                  href="https://github.com/goldenfocus/dalat-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
                >
                  <Github className="w-5 h-5" />
                  <span>Open Source on GitHub</span>
                  <ExternalLink className="w-4 h-4 opacity-60" />
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Contributions welcome! Check out our codebase, report issues, or
                  submit pull requests.
                </p>
              </div>
            </div>
          </section>

          {/* Our Stories Section - From "about" category */}
          {translatedAboutPosts.length > 0 && (
            <section className="mb-12">
              <h2 className="text-xl font-semibold mb-4">Our Stories</h2>
              <div className="grid gap-6">
                {translatedAboutPosts.map((post) => (
                  <BlogStoryCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}

          {/* What's New Section - Latest post from other categories */}
          {translatedLatestPost && (
            <section className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">What&apos;s New</h2>
                <Link
                  href="/blog"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all posts →
                </Link>
              </div>
              <BlogStoryCard post={translatedLatestPost} />
            </section>
          )}

          {/* Empty state if no content yet */}
          {translatedAboutPosts.length === 0 && !translatedLatestPost && (
            <section className="text-center py-12 text-muted-foreground">
              <p>More stories coming soon!</p>
              <Link
                href="/blog"
                className="text-primary hover:underline mt-2 inline-block"
              >
                Check out our blog →
              </Link>
            </section>
          )}
        </div>
      </main>

      <GlobalFooter />
    </>
  );
}
