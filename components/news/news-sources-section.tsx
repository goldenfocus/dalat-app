import { ExternalLink } from 'lucide-react';

interface Source {
  url: string;
  title: string;
  publisher: string;
  published_at: string | null;
}

interface NewsSourcesSectionProps {
  label: string;
  sources: Source[];
}

export function NewsSourcesSection({ label, sources }: NewsSourcesSectionProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
        {label}
      </h3>
      <ul className="space-y-1">
        {sources.map((source, i) => (
          <li key={i}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm rounded-lg px-2 py-2.5 -mx-2 hover:bg-accent/50 active:bg-accent active:scale-[0.99] transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5 mt-1 flex-shrink-0 text-muted-foreground" />
              <div>
                <span className="font-medium hover:text-primary transition-colors">
                  {source.title}
                </span>
                <span className="text-muted-foreground"> &mdash; {source.publisher}</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
