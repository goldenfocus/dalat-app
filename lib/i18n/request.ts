import { getRequestConfig } from 'next-intl/server';
import { locales as uiLocales, allLocales, defaultLocale } from './config';

// UI locales that have full translation files (en, fr, vi)
const UI_LOCALES_SET = new Set(uiLocales);

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale comes from middleware (URL-based)
  let locale = await requestLocale;

  // Validate locale, fallback to default
  if (!locale || !allLocales.includes(locale as typeof allLocales[number])) {
    locale = defaultLocale;
  }

  // Determine which message file to load
  // Full UI translations exist only for en, fr, vi
  // Other locales (ko, zh, ru, ja, ms, th, de, es, id) fall back to English UI
  const messagesLocale = UI_LOCALES_SET.has(locale as typeof uiLocales[number])
    ? locale
    : 'en';

  return {
    locale,
    messages: (await import(`@/messages/${messagesLocale}.json`)).default
  };
});
