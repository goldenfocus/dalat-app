"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

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
    <pre
      className="rounded-lg bg-muted overflow-x-auto my-4"
      {...props}
    >
      {children}
    </pre>
  ),
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
