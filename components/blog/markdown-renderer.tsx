"use client";

import { Suspense, lazy, useMemo } from "react";
import type { Components } from "react-markdown";

// Lazy-load react-markdown with remark-gfm bundled together
const LazyMarkdownWithGfm = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);

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
  // Strip H1 since the page already renders one
  h1: ({ children }) => (
    <h2 className="text-2xl font-bold mt-10 mb-4 text-foreground border-b border-border/40 pb-2">
      {children}
    </h2>
  ),
  // Rich H2 with accent bar
  h2: ({ children }) => (
    <h2 className="text-xl font-bold mt-10 mb-4 text-foreground flex items-center gap-2">
      <span className="w-1 h-6 bg-primary rounded-full shrink-0" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mt-6 mb-3 text-foreground">
      {children}
    </h3>
  ),
  // Paragraphs with comfortable spacing
  p: ({ children }) => (
    <p className="mb-4 leading-relaxed text-muted-foreground">
      {children}
    </p>
  ),
  // Styled lists
  ul: ({ children }) => (
    <ul className="mb-4 space-y-1.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 space-y-1.5 pl-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-muted-foreground leading-relaxed pl-1 relative before:content-['•'] before:text-primary before:font-bold before:absolute before:-left-3.5 [ol>&]:before:content-none">
      {children}
    </li>
  ),
  // Rich blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary/40 pl-4 py-2 my-6 bg-primary/5 rounded-r-lg italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  // Styled tables
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/50 text-foreground">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-muted-foreground border-t border-border/50">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
  ),
  // Horizontal rules as section dividers
  hr: () => (
    <hr className="my-8 border-none h-px bg-gradient-to-r from-transparent via-border to-transparent" />
  ),
  // Strong text with slight emphasis
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  // Custom links
  a: ({ href, children, ...props }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-primary hover:underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
        {...props}
      >
        {children}
        {isExternal && <span className="text-xs ml-0.5 opacity-50">↗</span>}
      </a>
    );
  },
  // Code
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[0.85em]"
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
  pre: ({ children, ...props }) => (
    <pre className="rounded-lg bg-muted overflow-x-auto my-4" {...props}>
      {children}
    </pre>
  ),
  // Images
  img: ({ src, alt }) => (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        className="w-full rounded-xl shadow-md"
        loading="lazy"
      />
      {alt && (
        <figcaption className="text-center text-sm text-muted-foreground/60 mt-2 italic">
          {alt}
        </figcaption>
      )}
    </figure>
  ),
};

function MarkdownSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 bg-muted rounded w-2/3" />
      <div className="h-4 bg-muted rounded w-full" />
      <div className="h-4 bg-muted rounded w-5/6" />
      <div className="h-4 bg-muted rounded w-4/5" />
      <div className="h-5 bg-muted rounded w-1/2 mt-6" />
      <div className="h-4 bg-muted rounded w-full" />
      <div className="h-4 bg-muted rounded w-3/4" />
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const safeContent = useMemo(() => {
    let text = content ?? "";
    // Strip leading H1 (the page renders its own title)
    text = text.replace(/^#\s+[^\n]+\n+/, "");
    return text;
  }, [content]);

  return (
    <Suspense fallback={<MarkdownSkeleton />}>
      <LazyMarkdownWithGfm components={components}>
        {safeContent}
      </LazyMarkdownWithGfm>
    </Suspense>
  );
}
