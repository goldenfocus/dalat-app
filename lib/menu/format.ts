/** "58,000 ₫" — grouping follows the reader's locale, the unit always trails. */
export function formatVnd(amount: number, locale: string): string {
  let grouped: string;
  try {
    grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
  }
  return `${grouped} ₫`;
}

/** Per-locale override with fallback to the venue's own wording. */
export function pickLocalized(
  overrides: Record<string, string> | null | undefined,
  locale: string,
  fallback: string,
): string;
export function pickLocalized(
  overrides: Record<string, string> | null | undefined,
  locale: string,
  fallback: string | null,
): string | null;
export function pickLocalized(
  overrides: Record<string, string> | null | undefined,
  locale: string,
  fallback: string | null,
): string | null {
  const hit = overrides?.[locale]?.trim();
  return hit ? hit : fallback;
}
