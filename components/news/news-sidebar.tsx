import { Link } from '@/lib/i18n/routing';
import { TrendingUp } from 'lucide-react';

interface TrendingItem {
  slug: string;
  title: string;
  like_count: number;
}

interface NewsSidebarProps {
  trendingLabel: string;
  trending: TrendingItem[];
}

export function NewsSidebar({ trendingLabel, trending }: NewsSidebarProps) {
  if (trending.length === 0) return null;

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          <TrendingUp className="h-4 w-4" />
          {trendingLabel}
        </h3>
        <div className="space-y-1">
          {trending.map((item, index) => (
            <Link
              key={item.slug}
              href={`/blog/news/${item.slug}`}
              className="group flex gap-3 items-start rounded-lg px-2 py-2.5 -mx-2 hover:bg-accent/50 active:bg-accent active:scale-[0.99] transition-all"
            >
              <span className="flex-shrink-0 text-2xl font-bold text-muted-foreground/40 leading-none mt-0.5">
                {index + 1}
              </span>
              <span className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                {item.title}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
