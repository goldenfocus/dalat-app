import type { Metadata } from "next";
import { Github } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BlogStoryCard } from "@/components/blog/blog-story-card";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema } from "@/lib/structured-data";
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
  const t = await getTranslations({ locale, namespace: "about" });

  return generateLocalizedMetadata({
    locale,
    path: "/about",
    title: t("title"),
    description: t("description"),
    keywords: ["about", "open source", "community", "Đà Lạt", "Vietnam"],
    type: "website",
  });
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });

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
      { name: t("title"), url: "/about" },
    ],
    locale
  );

  // FAQ content for SEO (generates rich snippets in Google)
  const faqs = [
    {
      question: "What is ĐàLạt.app?",
      answer:
        "ĐàLạt.app is a free, open-source event discovery platform for Da Lat, Vietnam. Find live music, art exhibitions, community gatherings, festivals, and more happening in Vietnam's highland city.",
    },
    {
      question: "Is ĐàLạt.app free to use?",
      answer:
        "Yes! ĐàLạt.app is completely free for both event attendees and organizers. There are no subscriptions, hidden fees, or premium tiers. The platform is open source and community-driven.",
    },
    {
      question: "How do I create an event on ĐàLạt.app?",
      answer:
        "Sign up for a free account, then click 'Create Event' from the homepage or navigation menu. Fill in your event details including title, date, location, and description, then publish instantly. Your event will be visible on the map, calendar, and event feed.",
    },
    {
      question: "What types of events can I find on ĐàLạt.app?",
      answer:
        "You can find all kinds of events in Da Lat including live music performances, art exhibitions, coffee meetups, community gatherings, festivals, markets, outdoor activities, and cultural celebrations. Events are organized by cafes, bars, galleries, and community organizers.",
    },
    {
      question: "Is ĐàLạt.app available in multiple languages?",
      answer:
        "Yes! ĐàLạt.app supports 12 languages including English, Vietnamese, Korean, Chinese, Japanese, French, German, Spanish, Russian, Thai, Malay, and Indonesian. The app automatically detects your preferred language.",
    },
  ];

  const faqSchema = generateFAQSchema(faqs);

  return (
    <>
      <JsonLd data={[breadcrumbSchema, faqSchema]} />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          {/* Header */}
          <header className="mb-12 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-4">
              {t("title")}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              {t("description")}
              <br />
              {t("tagline")}
            </p>

            {/* Open source badge - minimal */}
            <a
              href="https://github.com/goldenfocus/dalat-app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>{t("openSource")}</span>
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
    </>
  );
}
