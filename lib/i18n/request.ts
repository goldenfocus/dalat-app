import { getRequestConfig } from "next-intl/server";
import { locales, defaultLocale } from "./config";

// All 12 locales have full translation files
const VALID_LOCALES = new Set(locales);

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale comes from middleware (URL-based)
  let locale = await requestLocale;

  // Validate locale, fallback to default
  if (!locale || !VALID_LOCALES.has(locale as (typeof locales)[number])) {
    locale = defaultLocale;
  }

  // Load the message file for the requested locale
  return {
    locale,
    messages: {
      ...(await import(`@/messages/${locale}.json`)).default,
      // This unlisted workshop has reviewed EN/VI copy; other locales explicitly use English.
      phuong: {
        canvas: (
          await import(`@/messages/phuong/${locale === "vi" ? "vi" : "en"}.json`)
        ).default,
      },
    },
  };
});
