"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Clock, RefreshCw } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { JsonLd } from "@/lib/structured-data";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface PillarTemplateProps {
  storyContent: string;
  faqData?: FAQItem[];
  readingTime?: number;
  lastUpdated?: string;
  internalLinks?: string[];
}

function extractTOC(markdown: string): TOCItem[] {
  const headingPattern = /^(#{2,3})\s+(.+)$/gm;
  const items: TOCItem[] = [];

  for (const match of markdown.matchAll(headingPattern)) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    items.push({ id, text, level });
  }

  return items;
}

export function PillarTemplate({
  storyContent,
  faqData,
  readingTime,
  lastUpdated,
  internalLinks,
}: PillarTemplateProps) {
  const [activeSection, setActiveSection] = useState<string>("");
  const toc = extractTOC(storyContent);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [toc]);

  const faqSchema = faqData?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqData.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      }
    : null;

  return (
    <>
      {faqSchema && <JsonLd data={faqSchema} />}

      {/* Reading time + freshness badge */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
        {readingTime && (
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            {readingTime} min read
          </span>
        )}
        {lastUpdated && (
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Updated {new Date(lastUpdated).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-8">
        {/* Main content */}
        <div>
          <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
            <MarkdownRenderer content={storyContent} />
          </div>

          {/* FAQ Section */}
          {faqData && faqData.length > 0 && (
            <section className="mt-12 mb-8">
              <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
              <div className="space-y-4">
                {faqData.map((faq, i) => (
                  <details
                    key={i}
                    className="group border rounded-lg bg-card"
                  >
                    <summary className="flex items-center justify-between cursor-pointer p-4 font-medium">
                      {faq.question}
                      <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="px-4 pb-4 text-muted-foreground">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Related guides */}
          {internalLinks && internalLinks.length > 0 && (
            <section className="mt-8 p-6 rounded-lg bg-muted/50 border">
              <h3 className="font-semibold mb-3">Related Guides</h3>
              <div className="flex flex-wrap gap-2">
                {internalLinks.map((slug) => (
                  <a
                    key={slug}
                    href={`/blog/guides/${slug}`}
                    className="px-3 py-1.5 rounded-full text-sm bg-background border hover:bg-accent transition-colors"
                  >
                    {slug.replace(/-/g, " ")}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar TOC (desktop only) */}
        {toc.length > 2 && (
          <aside className="hidden lg:block">
            <nav className="sticky top-24">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                On this page
              </h4>
              <ul className="space-y-1 text-sm">
                {toc.map((item) => (
                  <li
                    key={item.id}
                    className={item.level === 3 ? "pl-3" : ""}
                  >
                    <a
                      href={`#${item.id}`}
                      className={`block py-1 transition-colors ${
                        activeSection === item.id
                          ? "text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </>
  );
}
