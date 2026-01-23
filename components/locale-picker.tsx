"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Link, usePathname } from "@/lib/i18n/routing";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { CONTENT_LOCALES, LOCALE_FLAGS, type ContentLocale } from "@/lib/types";

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

interface LocalePickerProps {
  /** Visual variant for different backgrounds */
  variant?: "default" | "overlay";
  className?: string;
  /** User ID to update profile locale preference */
  userId?: string;
}

/**
 * Compact language picker showing current locale flag.
 * Opens a popover grid with all 12 locales for instant switching.
 */
export function LocalePicker({ variant = "default", className, userId }: LocalePickerProps) {
  const locale = useLocale() as ContentLocale;
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Calculate position relative to trigger
  React.useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 200;
      const popoverHeight = 180;
      const padding = 8;

      // Position below the trigger, aligned to the right edge
      let left = rect.right - popoverWidth;
      let top = rect.bottom + padding;

      // Keep within viewport bounds
      if (left < padding) left = padding;
      if (left + popoverWidth > window.innerWidth - padding) {
        left = window.innerWidth - popoverWidth - padding;
      }
      if (top + popoverHeight > window.innerHeight - padding) {
        // Show above if no room below
        top = rect.top - popoverHeight - padding;
      }

      setPosition({ top, left });
    }
  }, [isOpen]);

  // Close on click outside or escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleLocaleClick = (newLocale: ContentLocale) => {
    // Close immediately for instant feel
    setIsOpen(false);

    // Set cookie for middleware (1 year expiry, secure in production)
    const secure = window.location.protocol === 'https:' ? ';secure' : '';
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;samesite=lax${secure}`;

    // Update profile in database if user is logged in
    if (userId) {
      const supabase = createClient();
      supabase
        .from("profiles")
        .update({ locale: newLocale })
        .eq("id", userId)
        .then(() => {
          // Silent update - navigation already happened via Link
        });
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Change language (currently ${LOCALE_LABELS[locale]})`}
        aria-expanded={isOpen}
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150",
          "text-xl leading-none",
          "active:scale-95",
          variant === "overlay"
            ? "hover:bg-white/20 active:bg-white/30"
            : "hover:bg-muted active:bg-muted/80",
          className
        )}
      >
        {LOCALE_FLAGS[locale]}
      </button>

      {/* Popover */}
      {isOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
            }}
            className={cn(
              "z-[100] w-[200px] rounded-xl p-2",
              "bg-popover/95 backdrop-blur-md",
              "border border-border shadow-xl",
              "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
            )}
          >
            <nav
              aria-label="Select language"
              className="grid grid-cols-4 gap-1"
            >
              {CONTENT_LOCALES.map((loc) => (
                <Link
                  key={loc}
                  href={pathname}
                  locale={loc}
                  replace
                  onClick={() => handleLocaleClick(loc)}
                  className={cn(
                    "flex items-center justify-center w-11 h-11 rounded-lg text-2xl",
                    "transition-all duration-100",
                    "active:scale-90",
                    loc === locale
                      ? "bg-primary/15 ring-2 ring-primary/50"
                      : "hover:bg-muted/80 active:bg-muted"
                  )}
                  aria-current={loc === locale ? "page" : undefined}
                  title={LOCALE_LABELS[loc]}
                >
                  {LOCALE_FLAGS[loc]}
                </Link>
              ))}
            </nav>
          </div>,
          document.body
        )}
    </>
  );
}
