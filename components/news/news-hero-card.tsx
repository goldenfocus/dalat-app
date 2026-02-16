import Image from 'next/image';
import { Link } from '@/lib/i18n/routing';
import { Clock, TrendingUp } from 'lucide-react';
import { formatTimeAgo } from '@/lib/news/format-time-ago';

interface NewsHeroCardProps {
  slug: string;
  title: string;
  storyContent: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  isBreaking: boolean;
  newsTags: string[];
  sourceName?: string;
}

export function NewsHeroCard({
  slug,
  title,
  storyContent,
  coverImageUrl,
  publishedAt,
  isBreaking,
  newsTags,
  sourceName,
}: NewsHeroCardProps) {
  const excerpt =
    storyContent
      .replace(/[#*[\]()]/g, '')
      .slice(0, 200)
      .trim() + '...';

  const timeAgo = publishedAt ? formatTimeAgo(publishedAt) : null;

  return (
    <Link
      href={`/blog/news/${slug}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-card active:scale-[0.99] transition-transform"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 66vw"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <TrendingUp className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        {isBreaking && (
          <div className="absolute left-3 top-3 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider animate-pulse">
            Breaking
          </div>
        )}
        {newsTags.length > 0 && !isBreaking && (
          <div className="absolute left-3 top-3 rounded-md bg-primary/90 px-2.5 py-1 text-xs font-medium text-primary-foreground capitalize">
            {newsTags[0]}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <h2 className="text-xl font-bold leading-tight sm:text-2xl group-hover:text-primary transition-colors">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {excerpt}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {timeAgo && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          )}
          {sourceName && <span>via {sourceName}</span>}
        </div>
      </div>
    </Link>
  );
}
