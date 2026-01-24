"use client";

import { Suspense, lazy, useState, useEffect } from "react";
import type { Components } from "react-markdown";

// Lazy-load react-markdown (~100KB) - only loads on blog pages
const LazyReactMarkdown = lazy(() => import("react-markdown"));

// Lazy-load remarkGfm for GitHub-flavored markdown
const remarkGfmPromise = import("remark-gfm").then((mod) => mod.default);

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  // Custom link handling
  a: ({ href, children, ...props }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-primary hover:underline"
        {...props}
      >
        {children}
      </a>
    );
  },
  // Code blocks with syntax highlighting placeholder
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={`block p-4 rounded-lg bg-muted overflow-x-auto font-mono text-sm ${className}`}
        {...props}
      >
        {children}
      </code>
    );
  },
  // Pre blocks
  pre: ({ children, ...props }) => (
    <pre className="rounded-lg bg-muted overflow-x-auto my-4" {...props}>
      {children}
    </pre>
  ),
};

function MarkdownSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-full" />
      <div className="h-4 bg-muted rounded w-5/6" />
    </div>
  );
}

// Inner component that uses the lazy-loaded ReactMarkdown
function MarkdownContent({ content }: { content: string }) {
  // Use the pre-imported remarkGfm
  const [remarkGfm, setRemarkGfm] = useState<typeof import("remark-gfm").default | null>(null);

  useEffect(() => {
    remarkGfmPromise.then(setRemarkGfm);
  }, []);

  return (
    <LazyReactMarkdown
      remarkPlugins={remarkGfm ? [remarkGfm] : []}
      components={components}
    >
      {content}
    </LazyReactMarkdown>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <Suspense fallback={<MarkdownSkeleton />}>
      <MarkdownContent content={content} />
    </Suspense>
  );
}
