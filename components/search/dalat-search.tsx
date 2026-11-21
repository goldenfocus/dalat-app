"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight, BookOpen, CalendarDays, FileText, House, LayoutGrid, LoaderCircle,
  MapPin, Newspaper, Search, Sparkles, UsersRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/lib/i18n/routing";
import { OriginalText } from "@/components/ui/original-text";
import { cn } from "@/lib/utils";
import {
  cleanSearchQuery, normalizeSearchQuery, searchDestinations, searchKinds, searchResultsHref, searchShortcut,
  type DalatSearchResult, type SearchKind, type SearchScope,
} from "@/lib/search/dalat";

const icons = {
  all: LayoutGrid, rentals: House, events: CalendarDays, people: UsersRound, texts: FileText,
  blog: BookOpen, news: Newspaper, experiences: Sparkles, venues: MapPin,
};
const scopes = ["all", ...searchKinds] as const;

type SearchResponse = { results: DalatSearchResult[]; signin?: boolean; degraded?: boolean };
type SearchProps = {
  rentalsLabel: string;
  initialQuery?: string;
  initialScope?: SearchScope;
  full?: boolean;
  onNavigate?: () => void;
  endAction?: ReactNode;
};

function sendSearchSignal(query: string, scope: SearchScope, locale: string, empty: boolean, clicked?: SearchKind) {
  void fetch("/api/search/dalat", {
    method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, scope, locale, clicked, empty }),
  }).catch(() => {});
}

export function DalatSearch({
  rentalsLabel, initialQuery = "", initialScope = "all", full = false, onNavigate, endAction,
}: SearchProps) {
  const t = useTranslations("home");
  const nav = useTranslations("nav");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState(initialScope);
  const [answer, setAnswer] = useState<{ key: string; data: SearchResponse }>();
  const [highlight, setHighlight] = useState(-1);
  const lastSubmission = useRef("");
  const clean = cleanSearchQuery(query);
  const valid = Array.from(normalizeSearchQuery(clean)).length >= 2;
  const key = JSON.stringify([clean, scope, locale, full]);
  const data = answer?.key === key ? answer.data : undefined;
  const labels: Record<SearchKind, string> = {
    rentals: rentalsLabel, events: nav("events"), people: nav("people"),
    texts: t("search.globalTexts"), blog: nav("blog"), news: nav("news"),
    experiences: nav("experiences"), venues: nav("venues"),
  };
  const shortcutKind = valid ? searchShortcut(clean, labels, scope) : null;
  const results = data?.results ?? [];
  const rows = shortcutKind
    ? [{ id: "section-" + shortcutKind, kind: shortcutKind, href: searchDestinations[shortcutKind], title: labels[shortcutKind] }, ...results]
    : results;
  const empty = Boolean(data && !data.degraded && !data.signin && rows.length === 0);

  useEffect(() => {
    if (!valid) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: clean, type: scope, locale, full: full ? "1" : "0" });
      try {
        const response = await fetch("/api/search/dalat?" + params.toString(), { signal: abort.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Search failed");
        const result: SearchResponse = await response.json();
        if (!abort.signal.aborted) setAnswer({ key, data: result });
      } catch {
        if (!abort.signal.aborted) setAnswer({ key, data: { results: [], degraded: true } });
      }
    }, full && clean === initialQuery ? 0 : 140);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [clean, full, initialQuery, key, locale, scope, valid]);

  useEffect(() => {
    if (!valid || !full || !data || clean !== initialQuery || scope !== initialScope || lastSubmission.current === key) return;
    lastSubmission.current = key;
    sendSearchSignal(clean, scope, locale, empty);
  }, [clean, data, empty, full, initialQuery, initialScope, key, locale, scope, valid]);

  function record(clicked?: SearchKind) {
    if (lastSubmission.current !== key) {
      lastSubmission.current = key;
      sendSearchSignal(clean, scope, locale, empty);
    }
    if (clicked) sendSearchSignal(clean, scope, locale, empty, clicked);
  }

  function openResults() {
    if (!valid) return;
    onNavigate?.();
    const href = searchResultsHref(clean, scope);
    if (full) router.replace(href);
    else router.push(href);
  }

  function openResult(result: DalatSearchResult) {
    record(result.kind);
    onNavigate?.();
    router.push(result.href);
  }

  return (
    <div className="min-h-0 space-y-2">
      <form role="search" onSubmit={event => { event.preventDefault(); openResults(); }}>
        <div className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 focus-within:border-primary">
          {valid && !data
            ? <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            : <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <input autoFocus type="search" value={query} maxLength={120}
            aria-label={t("search.globalPlaceholder")} placeholder={t("search.globalPlaceholder")}
            aria-controls={id + "-results"} autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            onChange={event => { setQuery(event.target.value); setHighlight(-1); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                if (!rows.length) return;
                event.preventDefault();
                const next = Math.max(-1, Math.min(rows.length - 1, highlight + (event.key === "ArrowDown" ? 1 : -1)));
                setHighlight(next);
                document.getElementById(id + "-result-" + next)?.scrollIntoView({ block: "nearest" });
              } else if (event.key === "Enter" && highlight >= 0 && rows[highlight]) {
                event.preventDefault();
                openResult(rows[highlight]);
              }
            }}
          />
          {endAction}
        </div>
        <fieldset className="mt-2 flex gap-1.5 overflow-x-auto px-0.5 py-1">
          <legend className="sr-only">{t("search.globalTypes")}</legend>
          {scopes.map(kind => {
            const Icon = icons[kind];
            return (
              <label key={kind} className="shrink-0 cursor-pointer">
                <input className="peer sr-only" type="radio" name={id + "-kind"} value={kind}
                  checked={kind === scope} onChange={() => { setScope(kind); setHighlight(-1); }} />
                <span className="flex min-h-10 items-center gap-1.5 rounded-full border bg-background px-3 text-sm text-muted-foreground
                  peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {kind === "all" ? t("search.globalAll") : labels[kind]}
                </span>
              </label>
            );
          })}
        </fieldset>
      </form>

      <div id={id + "-results"} aria-busy={valid && !data}>
        <span className="sr-only" aria-live="polite">{rows[highlight]?.title}</span>
        {valid && rows.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((result, index) => {
              const Icon = icons[result.kind];
              return (
                <li key={result.kind + ":" + result.id} id={id + "-result-" + index}
                  className="overflow-hidden first:rounded-t-xl last:rounded-b-xl">
                  <Link href={result.href} prefetch={false}
                    className={cn("flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-accent/50", highlight === index && "bg-accent")}
                    onClick={() => { record(result.kind); onNavigate?.(); }}>
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words text-sm font-medium">{result.title}</div>
                      {result.title !== labels[result.kind] &&
                        <div className="text-xs text-muted-foreground">{labels[result.kind]}</div>}
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  {result.originalTitle && <OriginalText className="mx-2 mb-1" text={result.originalTitle} sourceLocale={result.sourceLocale} />}
                </li>
              );
            })}
          </ul>
        )}
        {valid && data?.signin && (
          <Link className="inline-flex min-h-11 items-center px-2 text-sm text-primary hover:underline"
            href={"/auth/login?next=" + encodeURIComponent(searchResultsHref(clean, scope))} onClick={onNavigate}>
            {nav("signIn")}
          </Link>
        )}
        {valid && data && !data.signin && rows.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground" role="status">
            {data.degraded ? common("error") : t("search.globalNoResults")}
          </p>
        )}
        {!full && valid && (
          <button type="button" onClick={openResults}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-primary hover:bg-accent/50">
            <Search className="size-4" aria-hidden="true" />
            {t("search.viewAll", { query: clean })}
          </button>
        )}
      </div>
    </div>
  );
}
