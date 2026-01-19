import { FileCode } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";

interface TechnicalAccordionProps {
  content: string;
}

export function TechnicalAccordion({ content }: TechnicalAccordionProps) {
  return (
    <details className="group border rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between px-5 py-4 bg-muted/50 hover:bg-muted transition-colors cursor-pointer list-none active:scale-[0.99] active:opacity-90 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">Technical Details</span>
        </div>
        <svg
          className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer content={content} />
      </div>
    </details>
  );
}
