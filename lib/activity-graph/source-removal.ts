/**
 * Source-page removal detection shared by the activity-graph stale check and
 * the daily published-event source refresh.
 *
 * Ticketing/venue sites often answer a deleted product URL with a redirect
 * to their homepage (LuLuLoLa: 302 -> https://lululola.com.vn/). The
 * homepage is a valid HTML page, but it is NOT the event page: parsing it
 * would either find nothing or pick up other shows. Treat it as removed.
 */

const GONE_HTTP_STATUSES = new Set([404, 410, 451]);
const HOME_PATH =
  /^\/(?:(?:vi|vn|en|th|ko|ja|zh|fr|de)\/?)?(?:home|trang-chu|index(?:\.(?:html?|php|aspx?))?)?$/i;

/** Hours before a night when a still-removed source finally unlists it. */
export const SOURCE_REMOVED_UNLIST_WINDOW_HOURS = 36;
/** A removal must persist this long before it can unlist anything. */
export const SOURCE_REMOVED_MIN_AGE_HOURS = 20;

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/** True when `pathname` is a site's front page (/, /vi, /home, /index.html). */
export function isHomepagePath(pathname: string): boolean {
  return HOME_PATH.test(normalizePath(pathname));
}

/**
 * True when fetching `requestedUrl` ended on a site homepage instead of the
 * requested (non-homepage) resource.
 */
export function isHomepageRedirect(
  requestedUrl: string,
  finalUrl: string,
): boolean {
  let requested: URL;
  let final: URL;
  try {
    requested = new URL(requestedUrl);
    final = new URL(finalUrl);
  } catch {
    return false;
  }
  if (isHomepagePath(requested.pathname)) return false;
  const sameResource =
    requested.hostname.replace(/^www\./, "") ===
      final.hostname.replace(/^www\./, "") &&
    normalizePath(requested.pathname) === normalizePath(final.pathname);
  if (sameResource) return false;
  return isHomepagePath(final.pathname);
}

export function httpStatusFromFetchError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Source returned HTTP (\d{3})\b/);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isInteger(status) ? status : null;
}

export function isGoneHttpStatus(status: number): boolean {
  return GONE_HTTP_STATUSES.has(status);
}

export type SourcePageState =
  | { state: "live" }
  | { state: "removed"; evidence: string }
  | { state: "unknown"; reason: string };

/** Classify one fetch of an event's own source page. */
export function classifySourcePage(
  requestedUrl: string,
  observation: { ok: true; finalUrl: string } | { ok: false; error: unknown },
): SourcePageState {
  if (!observation.ok) {
    const status = httpStatusFromFetchError(observation.error);
    if (status !== null && isGoneHttpStatus(status)) {
      return { state: "removed", evidence: `HTTP ${status}` };
    }
    const message =
      observation.error instanceof Error
        ? observation.error.message
        : String(observation.error);
    return { state: "unknown", reason: message };
  }
  if (isHomepageRedirect(requestedUrl, observation.finalUrl)) {
    return {
      state: "removed",
      evidence: `redirects to homepage ${observation.finalUrl}`,
    };
  }
  return { state: "live" };
}

/**
 * A source removal only unlists a night once it has persisted for a while
 * (never from one observation) and the night is close. Until then the event
 * stays published and flagged for Review.
 */
export function shouldUnlistForRemovedSource(input: {
  unavailableSince: string | null | undefined;
  startsAt: string;
  now: Date;
}): boolean {
  if (!input.unavailableSince) return false;
  const since = Date.parse(input.unavailableSince);
  const start = Date.parse(input.startsAt);
  if (!Number.isFinite(since) || !Number.isFinite(start)) return false;
  const nowMs = input.now.getTime();
  if (nowMs - since < SOURCE_REMOVED_MIN_AGE_HOURS * 3_600_000) return false;
  return start - nowMs <= SOURCE_REMOVED_UNLIST_WINDOW_HOURS * 3_600_000;
}
