import { locales } from "@/lib/i18n/locales";

/**
 * The Fog Hour redesign was previewed on production under a URL prefix
 * (/v3/calendar, /vi/v3/map, any single digit). It is the default design now;
 * middleware.ts sends those old links to the page they showed.
 */
const channelPattern = new RegExp(`^(?:/(${locales.join("|")}))?/v[1-9](/.*)?$`);

/** The plain app path behind an old preview URL, or null for any other path. */
export function retiredPreviewTarget(pathname: string): string | null {
  const match = pathname.match(channelPattern);
  if (!match) return null;
  const locale = match[1] ? `/${match[1]}` : "";
  const rest = match[2] && match[2] !== "/" ? match[2] : "";
  return `${locale}${rest}` || "/";
}
