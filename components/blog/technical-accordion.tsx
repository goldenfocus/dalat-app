"use client";

import { useState } from "react";
import { ChevronDown, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";

interface TechnicalAccordionProps {
  content: string;
}

export function TechnicalAccordion({ content }: TechnicalAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-4",
          "bg-muted/50 hover:bg-muted transition-colors",
          "active:scale-[0.99] active:opacity-90"
        )}
      >
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">Technical Details</span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  );
}
