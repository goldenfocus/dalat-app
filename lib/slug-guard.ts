import { locales } from "@/lib/i18n/locales";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres rejects non-UUID text for uuid columns; never send it. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * True when a top-level /[locale]/[slug] request cannot be a profile, venue,
 * organizer, or community: an unknown locale segment (e.g. /api/inngest
 * matching locale="api") or a file-like slug (manifest.json, sw.js, *.php).
 * Unified slugs are lowercase words joined by hyphens/underscores and never
 * contain a dot.
 */
export function isUnroutableUnifiedSlug(locale: string, slug: string): boolean {
  if (!(locales as readonly string[]).includes(locale)) return true;
  if (!slug || slug.length > 120) return true;
  return slug.includes(".") || slug.includes("/");
}
