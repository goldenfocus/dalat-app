"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  CLIENT_NAMESPACES,
  CORE_CLIENT_NAMESPACES,
} from "@/lib/i18n/client-namespaces";
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

function pickNamespaces(all: Messages, namespaces: readonly string[]): Messages {
  const out: Messages = {};
  for (const ns of namespaces) {
    if (ns in all) out[ns] = all[ns];
  }
  return out;
}

interface Props {
  locale: Locale;
  /** Shell namespaces only — keeps the first RSC payload small. */
  coreMessages: Messages;
  children: React.ReactNode;
}

/**
 * Ships core i18n with HTML, then hydrates the full client dictionary after
 * paint so event forms / invite / loyalty / etc. still have keys without
 * bloating every page's initial payload (~45KB saved on wire HTML+RSC).
 */
export function ProgressiveIntlProvider({
  locale,
  coreMessages,
  children,
}: Props) {
  const [messages, setMessages] = useState<Messages>(coreMessages);

  useEffect(() => {
    let cancelled = false;
    const loader = LOCALE_LOADERS[locale];
    if (!loader) return;

    // Prefer idle, but don't wait forever — soft-nav to deep pages needs keys.
    const run = () => {
      loader()
        .then((mod) => {
          if (cancelled) return;
          const full = (mod.default ?? mod) as Messages;
          // Always keep core + any remaining client namespaces.
          const merged = {
            ...pickNamespaces(full, CORE_CLIENT_NAMESPACES),
            ...pickNamespaces(full, CLIENT_NAMESPACES),
          };
          setMessages(merged);
        })
        .catch((err) => {
          console.error("[i18n] failed to load full client messages", err);
        });
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(run, 50);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [locale]);

  // On locale change, reset to the server-provided core set (full dict reloads above).
  useEffect(() => {
    setMessages(coreMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when locale switches
  }, [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
