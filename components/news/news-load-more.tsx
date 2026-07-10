'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { NewsCompactCard } from '@/components/news/news-compact-card';

interface NewsPostRow {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string | null;
  published_at: string | null;
  news_tags: string[] | null;
  source_urls: Array<{ publisher?: string }> | null;
}

interface NewsLoadMoreProps {
  label: string;
  initialOffset: number;
  locale: string;
  pageSize?: number;
}

/**
 * "Load more" for /news — fetches the next page from /api/news/posts and
 * appends compact cards below the grouped list (appended posts are older
 * than everything above, so they read as a continuation of the last group).
 */
export function NewsLoadMore({
  label,
  initialOffset,
  locale,
  pageSize = 25,
}: NewsLoadMoreProps) {
  const [posts, setPosts] = useState<NewsPostRow[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/news/posts?offset=${offset}&locale=${locale}`);
      if (!res.ok) throw new Error(`Failed to load more news: ${res.status}`);
      const { posts: rows } = (await res.json()) as { posts: NewsPostRow[] };

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((p) => !seen.has(p.id))];
      });
      setOffset(offset + rows.length);
      if (rows.length < pageSize) setHasMore(false);
    } catch (error) {
      console.error('[news-load-more] Failed to load more news:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!hasMore && posts.length === 0) return null;

  return (
    <div className="space-y-3">
      {posts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {posts.map((post) => (
            <NewsCompactCard
              key={post.id}
              slug={post.slug}
              title={post.title}
              coverImageUrl={post.cover_image_url}
              publishedAt={post.published_at}
              newsTags={post.news_tags || []}
              sourceName={post.source_urls?.[0]?.publisher || ''}
            />
          ))}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/50 active:scale-[0.99] active:bg-accent/70 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {label}
        </button>
      )}
    </div>
  );
}
