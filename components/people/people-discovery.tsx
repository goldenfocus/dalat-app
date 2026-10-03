import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Link, getPathname, type Locale } from "@/lib/i18n/routing";
import { PEOPLE_INTENTIONS, PEOPLE_LANGUAGES } from "@/lib/people/constants";
import type { PeopleFilters } from "@/lib/people/types";
import { LOCALE_NAMES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PeopleMessage } from "./people-message";

export interface PeopleDiscoveryCopy {
  heading: string;
  subheading: string;
  manageProfile: string;
  privacyNotice: string;
  searchLabel: string;
  searchPlaceholder: string;
  intentionFilter: string;
  languageFilter: string;
  allIntentions: string;
  allLanguages: string;
  intentions: Record<string, string>;
  applyFilters: string;
  clearFilters: string;
  noResults: string;
  resultCount: string;
  previous: string;
  next: string;
  browsePeople: string;
  eventHeading: string;
}

function directoryHref(filters: PeopleFilters, page?: number) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.intention) query.set("intention", filters.intention);
  if (filters.language) query.set("language", filters.language);
  if (filters.eventId) query.set("event", filters.eventId);
  if (page && page > 1) query.set("page", String(page));
  return `/people${query.size ? `?${query.toString()}` : ""}`;
}

export function PeopleDiscovery({ locale, filters, hasMore, count, copy, children }: {
  locale: Locale;
  filters: PeopleFilters;
  hasMore: boolean;
  count: number;
  copy: PeopleDiscoveryCopy;
  children: ReactNode;
}) {
  const page = filters.page ?? 1;
  const hasFilters = !!(filters.q || filters.intention || filters.language);
  const resetHref = directoryHref({ eventId: filters.eventId });
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 pb-28 sm:py-12 sm:pb-28">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5 sm:mb-10">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.heading}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{copy.subheading}</p>
        </div>
        <Button asChild variant="outline" className="min-h-11"><Link href="/people/edit">{copy.manageProfile}</Link></Button>
      </header>

      {filters.eventId && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-2">
          <p className="text-sm font-medium">{copy.eventHeading}</p>
          <Link href="/people" className="-mr-2 flex min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground active:scale-95">{copy.browsePeople}</Link>
        </div>
      )}

      <form action={getPathname({ locale, href: "/people" })} method="get" className="space-y-4 border-y border-border py-5">
        {filters.eventId && <input type="hidden" name="event" value={filters.eventId} />}
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="col-span-2 space-y-2 lg:col-span-1">
            <label htmlFor="people-search" className="text-sm font-medium">{copy.searchLabel}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input id="people-search" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={100} placeholder={copy.searchPlaceholder} className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="people-intention" className="text-sm font-medium">{copy.intentionFilter}</label>
            <select id="people-intention" name="intention" defaultValue={filters.intention ?? ""} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{copy.allIntentions}</option>
              {PEOPLE_INTENTIONS.map((intention) => <option key={intention} value={intention}>{copy.intentions[intention]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="people-language" className="text-sm font-medium">{copy.languageFilter}</label>
            <select id="people-language" name="language" defaultValue={filters.language ?? ""} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{copy.allLanguages}</option>
              {PEOPLE_LANGUAGES.map((language) => <option key={language} value={language}>{LOCALE_NAMES[language]}</option>)}
            </select>
          </div>
          <Button type="submit" className="col-span-2 min-h-11 px-5 lg:col-span-1">{copy.applyFilters}</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{copy.privacyNotice}</p>
          {hasFilters && <Link href={resetHref} className="-my-2 -mr-2 flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground active:scale-95">{copy.clearFilters}</Link>}
        </div>
      </form>

      {count > 0 ? (
        <>
          <p className="mb-4 mt-6 text-sm text-muted-foreground">{copy.resultCount}</p>
          <div className="grid gap-4 md:grid-cols-2">{children}</div>
        </>
      ) : (
        <PeopleMessage title={copy.noResults}>
          {hasFilters && <Button asChild variant="outline" className="min-h-11"><Link href={resetHref}>{copy.clearFilters}</Link></Button>}
        </PeopleMessage>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-8 flex items-center justify-between gap-3">
          {page > 1 ? <Button asChild variant="outline" className="min-h-11"><Link href={directoryHref(filters, page - 1)}><ArrowLeft aria-hidden="true" />{copy.previous}</Link></Button> : <span />}
          {hasMore && <Button asChild variant="outline" className="min-h-11"><Link href={directoryHref(filters, page + 1)}>{copy.next}<ArrowRight aria-hidden="true" /></Link></Button>}
        </div>
      )}
    </div>
  );
}
