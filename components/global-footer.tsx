"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("home");
  const pathname = usePathname();

  // Remove locale prefix for language links
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";

  return (
    <footer className="border-t py-6 mt-auto pb-24 lg:pb-6">
      <div className="container max-w-4xl mx-auto px-4 space-y-3">
        {/* Translated footer text with heart icon */}
        <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
          {t.rich("footer", {
            heart: () => (
              <Heart
                className="w-4 h-4 text-red-500 fill-red-500 inline-block"
                aria-label="love"
              />
            ),
          })}
        </p>

        {/* Attribution */}
        <p className="text-center">
          <a
            href="https://goldenfocus.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
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
