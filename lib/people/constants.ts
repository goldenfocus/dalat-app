import { locales } from "@/lib/i18n/locales";

/** Deploy the schema and worker before enabling this release switch. */
export function isPeopleEnabled() {
  return process.env.NEXT_PUBLIC_PEOPLE_ENABLED === "true";
}

export const PEOPLE_INTENTIONS = [
  "friendship", "business", "projects", "creative", "activities",
  "community", "language_exchange", "events", "families",
] as const;
export const PEOPLE_INTERESTS = [
  "coffee", "hiking", "music", "art", "food", "technology", "wellness",
  "sports", "photography", "gardening", "books", "travel",
] as const;
export const PEOPLE_LANGUAGES = locales;
export const PEOPLE_REPORT_REASONS = ["harassment", "spam", "impersonation", "other"] as const;
export const PEOPLE_PAGE_SIZE = 24;
