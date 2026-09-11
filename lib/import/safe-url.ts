import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicNetworkAddress } from "@/lib/events/event-suggestion";

/**
 * Parse an http(s) URL that is safe to persist (no credentials, not a
 * loopback/local hostname, public IP if the host is numeric).
 * Does not resolve DNS — use {@link isSafePublicHttpUrl} before fetching.
 */
export function parsePublicHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan")
    ) {
      return null;
    }

    if (isIP(hostname) && !isPublicNetworkAddress(hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

/** Canonical form used for scout/WhatsApp source idempotency. */
export function canonicalizeSourceUrl(input: string): string | null {
  const url = parsePublicHttpUrl(input);
  if (!url) return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/**
 * Persistable WhatsApp provenance identifier (not fetched). Review treats
 * this the same as a web source_url for "has provenance" checks.
 */
export function whatsappSourceRef(groupJid: string, messageId: string): string {
  return `whatsapp:${groupJid}/${messageId}`;
}

export function isPersistedSourceRef(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  if (value.startsWith("whatsapp:")) return value.length > 10;
  return parsePublicHttpUrl(value) !== null;
}

/** Resolve DNS and reject private/link-local answers before an outbound fetch. */
export async function isSafePublicHttpUrl(input: string): Promise<boolean> {
  const url = parsePublicHttpUrl(input);
  if (!url) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return true;
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicNetworkAddress(address))
    );
  } catch {
    return false;
  }
}
