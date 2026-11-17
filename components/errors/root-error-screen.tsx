"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadLocaleMessages } from "@/components/progressive-intl-provider";
import { locales } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/routing";
import {
  canReload,
  planRecovery,
  recallErrorLabels,
  reloadOnce,
  whenReachable,
  type ErrorLabels,
} from "@/lib/errors/recovery";

interface Props {
  error: Error & { digest?: string };
  /** Re-fetches the route and re-renders (Next's `unstable_retry`). */
  retry: () => void;
}

/**
 * Last line of defence, for errors above the locale layout's own boundary:
 * the shell is gone, so recover without waiting for the visitor. One soft
 * retry, then one full reload, and only then an error screen.
 */
export function RootErrorScreen({ error, retry }: Props) {
  const [plan] = useState(() => planRecovery(error));
  // Spinner while an automatic attempt is on its way, error screen otherwise.
  const [recovering] = useState(() =>
    plan === "retry"
      ? typeof navigator === "undefined" || navigator.onLine !== false
      : plan === "reload" || canReload()
  );
  const [labels, setLabels] = useState<ErrorLabels | null>(recallErrorLabels);

  useEffect(() => {
    console.error("Root error boundary caught:", error);
    if (plan !== "retry") {
      // Stale build, or the soft retry was just used: a full reload is next.
      reloadOnce();
      return;
    }
    const recovery = new AbortController();
    whenReachable(recovery.signal).then(retry, () => {});
    return () => recovery.abort();
  }, [error, plan, retry]);

  // This screen renders outside the i18n provider. The labels normally come
  // from the locale layout; if it never rendered, load them for this locale.
  useEffect(() => {
    if (labels) return;
    let cancelled = false;
    const lang = document.documentElement.lang as Locale;
    loadLocaleMessages(locales.includes(lang) ? lang : "en")
      .then((messages) => {
        const errors = messages.errors as Record<string, string> | undefined;
        if (cancelled || !errors) return;
        setLabels({
          title: errors.somethingWentWrong,
          description: errors.unexpectedError,
          tryAgain: errors.tryAgain,
          refreshPage: errors.refreshPage,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [labels]);

  if (recovering) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      {labels && (
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{labels.title}</h1>
          <p className="max-w-md text-sm text-muted-foreground">{labels.description}</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={retry} variant="outline" className="h-11" aria-label={labels?.tryAgain}>
          <RefreshCw aria-hidden="true" />
          {labels?.tryAgain}
        </Button>
        {labels && (
          <Button onClick={() => window.location.reload()} className="h-11">
            {labels.refreshPage}
          </Button>
        )}
      </div>
    </div>
  );
}
