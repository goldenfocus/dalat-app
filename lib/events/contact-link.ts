export function normalizeEventContactLink(value: string): string | null {
  const input = value.trim();
  if (!input || /[\s\x5c]/.test(input) || input.startsWith("//")) return null;

  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
    const url = new URL(hasScheme ? input : "https://" + input);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username || url.password || !url.hostname.includes(".")
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}
