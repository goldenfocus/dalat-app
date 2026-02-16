import Image from 'next/image';
import { Link } from '@/lib/i18n/routing';
import { Clock } from 'lucide-react';
import { formatTimeAgo } from '@/lib/news/format-time-ago';

interface NewsCompactCardProps {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  newsTags: string[];
  sourceName?: string;
}

export function NewsCompactCard({
  slug,
  title,
  coverImageUrl,
  publishedAt,
  newsTags,
  sourceName,
}: NewsCompactCardProps) {
  const timeAgo = publishedAt ? formatTimeAgo(publishedAt) : null;

  return (
    <Link
      href={`/blog/news/${slug}`}
      className="group flex gap-3 rounded-lg border border-border/50 bg-card p-3 min-h-[72px] transition-colors hover:bg-accent/50 active:scale-[0.99] active:bg-accent/70"
    >
      {coverImageUrl && (
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md">
          <Image
            src={coverImageUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="80px"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          {newsTags[0] && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary capitalize text-[11px]">
              {newsTags[0]}
            </span>
          )}
          {timeAgo && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          )}
          {sourceName && (
            <span className="truncate">via {sourceName}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
