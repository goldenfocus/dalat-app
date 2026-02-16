'use client';

import { useState } from 'react';
import { Link } from '@/lib/i18n/routing';
import { X, AlertTriangle } from 'lucide-react';

interface BreakingTickerProps {
  label: string;
  articles: Array<{ slug: string; title: string }>;
}

export function BreakingTicker({ label, articles }: BreakingTickerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || articles.length === 0) return null;

  // Duplicate content so the scroll appears seamless
  const doubled = [...articles, ...articles];

  return (
    <div className="relative flex items-center gap-3 rounded-lg bg-red-600 px-4 py-2.5 text-white">
      <span className="flex-shrink-0 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {label}
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="animate-marquee whitespace-nowrap">
          {doubled.map((article, i) => (
            <Link
              key={`${article.slug}-${i}`}
              href={`/blog/news/${article.slug}`}
              className="inline-block px-3 py-2 text-sm font-medium hover:underline"
            >
              {article.title}
              {i < doubled.length - 1 && <span className="mx-4 opacity-50">&bull;</span>}
            </Link>
          ))}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-2 -mr-1 rounded-lg hover:bg-white/20 active:bg-white/30 active:scale-95 transition-all"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
