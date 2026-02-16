import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { unstable_cache } from 'next/cache';
import { createStaticClient } from '@/lib/supabase/server';
import { NewsCompactCard } from '@/components/news/news-compact-card';
import { NewsTagFilter } from '@/components/news/news-tag-filter';
import { Link } from '@/lib/i18n/routing';
import { ArrowLeft, Newspaper } from 'lucide-react';
import { NEWS_TAGS } from '@/lib/types/blog';

const SITE_URL = 'https://dalat.app';

type Props = {
  params: Promise<{ locale: string; tag: string }>;
};

export async function generateStaticParams() {
  return NEWS_TAGS.map(tag => ({ tag }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, tag } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });

  const TAG_KEYS: Record<string, string> = {
    'tourism': 'tagTourism',
    'culture': 'tagCulture',
    'events': 'tagEvents',
    'government': 'tagGovernment',
    'food-drink': 'tagFoodDrink',
    'weather': 'tagWeather',
    'community': 'tagCommunity',
  };

  const tagName = t(TAG_KEYS[tag] || tag);

  return {
    title: `${tagName} — ${t('title')}`,
    description: `${tagName} news from Da Lat`,
    alternates: {
      canonical: `${SITE_URL}/${locale}/news/tag/${tag}`,
    },
  };
}

export default async function NewsTagPage({ params }: Props) {
  const { locale, tag } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });

  const TAG_KEYS: Record<string, string> = {
    'tourism': 'tagTourism',
    'culture': 'tagCulture',
    'events': 'tagEvents',
    'government': 'tagGovernment',
    'food-drink': 'tagFoodDrink',
    'weather': 'tagWeather',
    'community': 'tagCommunity',
  };

  const tagName = t(TAG_KEYS[tag] || tag);

  const getTaggedPosts = unstable_cache(
    async () => {
      const supabase = createStaticClient();
      if (!supabase) return [];

      const { data } = await supabase.rpc('get_news_posts', {
        p_tag: tag,
        p_limit: 30,
        p_offset: 0,
      });

      return data || [];
    },
    [`news-tag-${tag}`],
    { revalidate: 300, tags: ['news'] }
  );

  const posts = await getTaggedPosts();

  const getSourceName = (post: any) => {
    const sources = post.source_urls as any[];
    return sources?.[0]?.publisher || '';
  };

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        href="/news"
        className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-4 w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t('backToNews')}</span>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Newspaper className="h-6 w-6 text-primary" />
          {tagName}
        </h1>
      </div>

      {/* Tag filter */}
      <div className="mb-6">
        <NewsTagFilter activeTag={tag} />
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <p>{t('noNews')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post: any) => (
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
      )}
    </div>
  );
}
