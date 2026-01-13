import { Locale, ContentLocale, CONTENT_LOCALES, LOCALES } from '@/lib/types';

// UI locales - all 12 languages have full translation files in messages/*.json
export const locales: Locale[] = LOCALES;
export const defaultLocale: Locale = 'en';

// Content locales - The Global Twelve for user-generated content
export const contentLocales: ContentLocale[] = CONTENT_LOCALES;

// All valid URL locales (union of UI and content locales)
// This allows URLs like /ko/events/... even if UI falls back to English
export const allLocales: ContentLocale[] = CONTENT_LOCALES;

export type Messages = typeof import('@/messages/en.json');
