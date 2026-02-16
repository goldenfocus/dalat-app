import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { unstable_cache } from 'next/cache';
import { createStaticClient } from '@/lib/supabase/server';
import { NewsHeroCard } from '@/components/news/news-hero-card';
import { NewsCompactCard } from '@/components/news/news-compact-card';
import { NewsTagFilter } from '@/components/news/news-tag-filter';
import { NewsSidebar } from '@/components/news/news-sidebar';
import { BreakingTicker } from '@/components/news/breaking-ticker';
import { Newspaper } from 'lucide-react';

const SITE_URL = 'https://dalat.app';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });

  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE_URL}/${locale}/news`,
      languages: Object.fromEntries(
        ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'].map(l => [
          l,
          `${SITE_URL}/${l}/news`,
        ])
      ),
    },
    openGraph: {
      title: t('title'),
      description: t('subtitle'),
      type: 'website',
      url: `${SITE_URL}/${locale}/news`,
    },
  };
}

const getNewsPosts = unstable_cache(
  async () => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data } = await supabase.rpc('get_news_posts', {
      p_limit: 25,
      p_offset: 0,
    });

    return data || [];
  },
  ['news-posts'],
  { revalidate: 300, tags: ['news'] }
);

const getTrendingNews = unstable_cache(
  async () => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data } = await supabase.rpc('get_trending_news', {
      p_limit: 5,
    });

    return data || [];
  },
  ['trending-news'],
  { revalidate: 600, tags: ['news'] }
);

export default async function NewsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });

  const [posts, trending] = await Promise.all([
    getNewsPosts(),
    getTrendingNews(),
  ]);

  // Separate breaking, featured, and regular
  const breakingPosts = posts.filter((p: any) => p.is_breaking);
  const featuredPost = posts.find((p: any) => p.is_featured && !p.is_breaking);
  const heroPost = featuredPost || posts[0];
  const regularPosts = posts.filter((p: any) => p !== heroPost && !p.is_breaking);

  // Extract source names from source_urls
  const getSourceName = (post: any) => {
    const sources = post.source_urls as any[];
    return sources?.[0]?.publisher || '';
  };

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6">
      {/* Breaking news ticker */}
      {breakingPosts.length > 0 && (
        <div className="mb-4">
          <BreakingTicker
            label={t('breaking')}
            articles={breakingPosts.map((p: any) => ({
              slug: p.slug,
              title: p.title,
            }))}
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Newspaper className="h-7 w-7 text-primary" />
          {t('title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Tag filter */}
      <div className="mb-6">
        <NewsTagFilter />
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Newspaper className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p>{t('noNews')}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Main content */}
          <div className="space-y-6">
            {/* Hero card */}
            {heroPost && (
              <NewsHeroCard
                slug={heroPost.slug}
                title={heroPost.title}
                storyContent={heroPost.story_content}
                coverImageUrl={heroPost.cover_image_url}
                publishedAt={heroPost.published_at}
                isBreaking={heroPost.is_breaking}
                newsTags={heroPost.news_tags || []}
                sourceName={getSourceName(heroPost)}
              />
            )}

            {/* Grid of compact cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {regularPosts.map((post: any) => (
                <NewsCompactCard
                  key={post.id}
                  slug={post.slug}
                  title={post.title}
                  coverImageUrl={post.cover_image_url}
                  publishedAt={post.published_at}
                  newsTags={post.news_tags || []}
                  sourceName={getSourceName(post)}
                />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <NewsSidebar
              trendingLabel={t('trending')}
              trending={trending.map((item: any) => ({
                slug: item.slug,
                title: item.title,
                like_count: item.like_count,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
