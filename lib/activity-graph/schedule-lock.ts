export function hasLockedSchedule(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.schedule_locked === true;
}

function canonicalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function addUrl(urls: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const canonical = canonicalSourceUrl(value);
  if (canonical) urls.add(canonical);
}

/** Official / confirming page URLs stored on a locked (or any) event. */
export function confirmingSourceUrls(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const urls = new Set<string>();
  if (!metadata) return [];
  addUrl(urls, metadata.source_url);
  addUrl(urls, metadata.article_url);
  const listed = metadata.source_urls_confirming;
  if (Array.isArray(listed)) {
    for (const value of listed) addUrl(urls, value);
  }
  return [...urls];
}

/** Confirming URLs other than the one already known to be gone. */
export function otherConfirmingSourceUrls(
  metadata: Record<string, unknown> | null | undefined,
  knownDeadUrl: string,
): string[] {
  const dead = canonicalSourceUrl(knownDeadUrl);
  return confirmingSourceUrls(metadata).filter((url) => url !== dead);
}

/**
 * A locked row is unlisted only when at least one *other* confirming source
 * is also gone. A single 404 is not enough.
 */
export function mayUnlistLockedSchedule(otherRemovedCount: number): boolean {
  return otherRemovedCount >= 1;
}
