import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";
import type {
  EventContentBlockingIssue,
  EventIndexingReadiness,
} from "@/lib/translations-readiness";

export interface EventIndexingHealthIssue {
  eventId: string;
  slug: string;
  readyLocaleCount: number;
  missingLocales: ContentLocale[];
  contentBlockingIssues: EventContentBlockingIssue[];
}

export interface EventIndexingHealthSummary {
  total: number;
  allLocalesReady: number;
  incomplete: number;
  issues: EventIndexingHealthIssue[];
}

/**
 * Customer-facing SEO promise: every upcoming public event must be ready in
 * every supported language. Keep this pure so the daily watchdog and tests use
 * exactly the same definition as metadata, sitemap, and IndexNow submission.
 */
export function summarizeEventIndexingHealth(
  readiness: Iterable<EventIndexingReadiness>
): EventIndexingHealthSummary {
  const results = [...readiness];
  const issues = results
    .filter((event) => !event.allLocalesReady)
    .map((event): EventIndexingHealthIssue => ({
      eventId: event.eventId,
      slug: event.slug,
      readyLocaleCount: event.readyLocales.length,
      missingLocales: event.locales
        .filter((locale) => !locale.ready)
        .map((locale) => locale.locale),
      contentBlockingIssues: event.content.blockingIssues,
    }));

  return {
    total: results.length,
    allLocalesReady: results.length - issues.length,
    incomplete: issues.length,
    issues,
  };
}

export function buildEventIndexingHealthProblem(
  summary: EventIndexingHealthSummary
): string | null {
  if (summary.incomplete === 0) return null;

  const examples = summary.issues.slice(0, 5).map((issue) => {
    const reason = issue.contentBlockingIssues.length > 0
      ? issue.contentBlockingIssues.join(",")
      : `missing ${issue.missingLocales.join(",")}`;
    return `${issue.slug} (${issue.readyLocaleCount}/${CONTENT_LOCALES.length}: ${reason})`;
  });
  const remainder = summary.incomplete > examples.length
    ? `; +${summary.incomplete - examples.length} more`
    : "";

  return `event indexing: ${summary.incomplete}/${summary.total} upcoming published event(s) are not ready in all ${CONTENT_LOCALES.length} languages — ${examples.join("; ")}${remainder}`;
}
