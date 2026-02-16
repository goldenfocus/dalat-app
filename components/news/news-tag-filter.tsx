'use client';

import { Link } from '@/lib/i18n/routing';
import { useTranslations } from 'next-intl';
import { NEWS_TAGS } from '@/lib/types/blog';

const TAG_KEYS: Record<string, string> = {
  'tourism': 'tagTourism',
  'culture': 'tagCulture',
  'events': 'tagEvents',
  'government': 'tagGovernment',
  'food-drink': 'tagFoodDrink',
  'weather': 'tagWeather',
  'community': 'tagCommunity',
};

interface NewsTagFilterProps {
  activeTag?: string;
}

export function NewsTagFilter({ activeTag }: NewsTagFilterProps) {
  const t = useTranslations('news');

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
      <Link
        href="/news"
        className={`flex-shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors active:scale-95 ${
          !activeTag
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        {t('allNews')}
      </Link>
      {NEWS_TAGS.map(tag => (
        <Link
          key={tag}
          href={`/news/tag/${tag}`}
          className={`flex-shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap active:scale-95 ${
            activeTag === tag
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {t(TAG_KEYS[tag] || tag)}
        </Link>
      ))}
    </div>
  );
}
