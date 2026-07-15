"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { CORE_CLIENT_NAMESPACES } from "@/lib/i18n/client-namespaces";
import { extraNamespacesForPath } from "@/lib/i18n/route-message-islands";
import type { Locale } from "@/lib/i18n/routing";

type Messages = Record<string, unknown>;

// Explicit map so Turbopack/webpack can code-split each locale JSON.
const LOCALE_LOADERS: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import("@/messages/en.json"),
  vi: () => import("@/messages/vi.json"),
  ko: () => import("@/messages/ko.json"),
  zh: () => import("@/messages/zh.json"),
  ru: () => import("@/messages/ru.json"),
  fr: () => import("@/messages/fr.json"),
  ja: () => import("@/messages/ja.json"),
  ms: () => import("@/messages/ms.json"),
  th: () => import("@/messages/th.json"),
  de: () => import("@/messages/de.json"),
  es: () => import("@/messages/es.json"),
  id: () => import("@/messages/id.json"),
};

// Module-level cache: one JSON parse per locale per session
const localeCache = new Map<Locale, Messages>();

function pickNamespaces(all: Messages, namespaces: readonly string[]): Messages {
  const out: Messages = {};
  for (const ns of namespaces) {
    if (ns in all) out[ns] = all[ns];
  }
  return out;
}

async function loadLocaleMessages(locale: Locale): Promise<Messages> {
  const cached = localeCache.get(locale);
  if (cached) return cached;
  const loader = LOCALE_LOADERS[locale];
  if (!loader) return {};
  const mod = await loader();
  const full = (mod.default ?? mod) as Messages;
  localeCache.set(locale, full);
  return full;
}

interface Props {
  locale: Locale;
  /** Shell namespaces only — keeps the first RSC payload small. */
  coreMessages: Messages;
  children: React.ReactNode;
}

/**
 * Ships core i18n with HTML, then loads route-level message islands only when
 * the path needs them. Homepage never pulls the full client dictionary.
 */
export function ProgressiveIntlProvider({
  locale,
  coreMessages,
  children,
}: Props) {
  const pathname = usePathname() ?? "/";
  const [messages, setMessages] = useState<Messages>(coreMessages);
  const loadedExtrasRef = useRef<Set<string>>(new Set());

  // Reset core on locale change
  useEffect(() => {
    setMessages(coreMessages);
    loadedExtrasRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on locale switch
  }, [locale]);

  // Route-level islands: load only what's missing for this path
  useEffect(() => {
    let cancelled = false;
    const extras = extraNamespacesForPath(pathname);
    if (extras.length === 0) return;

    const missing = extras.filter((ns) => !loadedExtrasRef.current.has(ns));
    if (missing.length === 0) return;

    loadLocaleMessages(locale)
      .then((full) => {
        if (cancelled) return;
        const picked = pickNamespaces(full, missing);
        for (const ns of missing) loadedExtrasRef.current.add(ns);
        setMessages((prev) => ({
          ...prev,
          // Keep core authoritative from server
          ...pickNamespaces(prev, CORE_CLIENT_NAMESPACES),
          ...picked,
        }));
      })
      .catch((err) => {
        console.error("[i18n] failed to load route message island", err);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, locale]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      // Soft-nav island may lag one frame — never crash the tree on a missing key
      onError={(err) => {
        if (
          err.code === "MISSING_MESSAGE" ||
          err.code === "ENVIRONMENT_FALLBACK"
        ) {
          return;
        }
        console.error("[i18n]", err);
      }}
      getMessageFallback={({ namespace, key }) =>
        namespace ? `${namespace}.${key}` : key
      }
    >
      {children}
    </NextIntlClientProvider>
  );
}
