"use client";

import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";

const LOCALE_LABELS: Record<ContentLocale, string> = {
  en: "English",
  vi: "Tiếng Việt",
  ko: "한국어",
  zh: "中文",
  ru: "Русский",
  fr: "Français",
  ja: "日本語",
  ms: "Bahasa Melayu",
  th: "ไทย",
  de: "Deutsch",
  es: "Español",
  id: "Indonesia",
};

/**
 * Minimal global footer with translated text.
 * Language links are visually hidden but SEO-crawlable.
 */
export function GlobalFooter() {
  const pathname = usePathname();

  // Remove locale prefix for language links
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";

  return (
    <footer className="hidden lg:block border-t py-6 mt-auto">
      <div className="container max-w-6xl mx-auto px-4 space-y-3">
        {/* Footer text with heart icon */}
        <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
          Made with
          <Heart
            className="w-4 h-4 text-red-500 fill-red-500 inline-block"
            aria-label="love"
          />
          for Đà Lạt, Vietnam
        </p>

        {/* Links */}
        <p className="text-center text-xs text-muted-foreground/60 flex items-center justify-center gap-3">
          <Link
            href="/about"
            className="hover:text-muted-foreground transition-colors"
          >
            About
          </Link>
          <span>·</span>
          <Link
            href="/blog"
            className="hover:text-muted-foreground transition-colors"
          >
            Blog
          </Link>
          <span>·</span>
          <a
            href="https://goldenfocus.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            goldenfocus.io
          </a>
        </p>

        {/* SEO-only language links - visually hidden but crawlable */}
        <nav aria-label="Language selection" className="sr-only">
          {CONTENT_LOCALES.map((loc) => (
            <Link
              key={loc}
              href={pathWithoutLocale}
              locale={loc}
              aria-label={LOCALE_LABELS[loc]}
            >
              {LOCALE_LABELS[loc]}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
