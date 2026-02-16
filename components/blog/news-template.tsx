import { ExternalLink, Clock } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface NewsTemplateProps {
  storyContent: string;
  source?: string;
  publishedAt?: string;
  sourceUrls?: string[];
}

export function NewsTemplate({
  storyContent,
  source,
  publishedAt,
  sourceUrls,
}: NewsTemplateProps) {
  const timeAgo = publishedAt ? getTimeAgo(new Date(publishedAt)) : null;

  return (
    <div>
      {/* Source attribution banner */}
      {source && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 rounded-lg bg-muted/50 border">
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          <span>
            Source: <span className="font-medium text-foreground">{formatSourceName(source)}</span>
          </span>
          {timeAgo && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {timeAgo}
              </span>
            </>
          )}
        </div>
      )}

      {/* Article body */}
      <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
        <MarkdownRenderer content={storyContent} />
      </div>

      {/* Source links */}
      {sourceUrls && sourceUrls.length > 0 && (
        <div className="mt-8 p-4 rounded-lg border bg-card">
          <h3 className="text-sm font-semibold mb-2">Sources</h3>
          <ul className="space-y-1">
            {sourceUrls.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  {new URL(url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    news_harvest: "Vietnamese Media",
    auto_agent: "AI Generated",
    manual: "Editorial",
    daily_summary: "Daily Summary",
    github_release: "GitHub",
    programmatic: "Auto-Generated",
  };
  return names[source] || source;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
