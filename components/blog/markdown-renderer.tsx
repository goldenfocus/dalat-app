"use client";

import { Suspense, lazy } from "react";
import type { Components } from "react-markdown";

// Lazy-load react-markdown with remark-gfm bundled together
// This avoids state management issues with concurrent React features
const LazyMarkdownWithGfm = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);

  // Return a wrapper component that has remarkGfm pre-configured
  return {
    default: function MarkdownWithGfm({
      children,
      components,
    }: {
      children: string;
      components: Components;
    }) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </ReactMarkdown>
      );
    },
  };
});

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

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Guard against null/undefined content (can happen with missing translations)
  const safeContent = content ?? "";

  return (
    <Suspense fallback={<MarkdownSkeleton />}>
      <LazyMarkdownWithGfm components={components}>
        {safeContent}
      </LazyMarkdownWithGfm>
    </Suspense>
  );
}
