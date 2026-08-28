import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  extractPublishedDate,
  extractTitle,
  stripHtml,
} from "@/lib/news/base-scraper";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1_000_000;
const MAX_EXTRACTED_TEXT = 14_000;

// The explicit-admin URL importer deliberately uses a fixed source allowlist.
// Preflight DNS validation
// followed by a normal hostname fetch is vulnerable to DNS rebinding, so an
// arbitrary-domain fetch is not an acceptable public boundary.
const ALLOWED_SOURCE_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "eventbrite.com",
  "meetup.com",
  "lu.ma",
  "luma.com",
  "flip.vn",
  "dalat-info.gov.vn",
  "wellhoods.com",
  "maylangthang.com.vn",
  "ticketbox.vn",
] as const;

export type SuggestionErrorCode =
  | "invalid_url"
  | "unsafe_url"
  | "source_unavailable"
  | "unsupported_source"
  | "source_too_large";

export class SuggestionSourceError extends Error {
  constructor(public readonly code: SuggestionErrorCode) {
    super(code);
    this.name = "SuggestionSourceError";
  }
}

export interface EventSourcePreview {
  url: string;
  title: string;
  publishDate?: string;
  content: string;
  imageUrls: string[];
}

/**
 * Canonical form used for import idempotency. Tracking parameters and fragments
 * should not make one source look like multiple activities.
 */
export function normalizeSuggestionUrl(input: string): string {
  const url = new URL(input.trim());
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

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

/** Reject addresses that are local, private, link-local, reserved, or multicast. */
export function isPublicNetworkAddress(address: string): boolean {
  const mappedIpv4 = address
    .toLowerCase()
    .match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = parseIpv4(mappedIpv4 ?? address);

  if (ipv4) {
    const [a, b, c] = ipv4;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false;
    return true;
  }

  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (/^f[cd]/.test(normalized)) return false; // unique-local fc00::/7
  if (/^fe[89ab]/.test(normalized)) return false; // link-local fe80::/10
  if (normalized.startsWith("ff")) return false; // multicast
  return true;
}

function parseSuggestionUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SuggestionSourceError("invalid_url");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new SuggestionSourceError("invalid_url");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    throw new SuggestionSourceError("unsafe_url");
  }

  if (isIP(hostname) && !isPublicNetworkAddress(hostname)) {
    throw new SuggestionSourceError("unsafe_url");
  }
  if (
    !ALLOWED_SOURCE_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    )
  ) {
    throw new SuggestionSourceError("unsupported_source");
  }
  return url;
}

async function assertPublicDestination(url: URL): Promise<void> {
  if (isIP(url.hostname)) return;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new SuggestionSourceError("source_unavailable");
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicNetworkAddress(address))
  ) {
    throw new SuggestionSourceError("unsafe_url");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new SuggestionSourceError("source_too_large");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new SuggestionSourceError("source_too_large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Convert a public event/article page into the same inert payload consumed by
 * the existing review worker. Redirects are followed manually so each target
 * is revalidated before any request is made.
 */
export async function fetchEventSourcePreview(
  input: string,
): Promise<EventSourcePreview> {
  let current = parseSuggestionUrl(input);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicDestination(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "vi,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)",
        },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw new SuggestionSourceError("source_unavailable");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) {
        throw new SuggestionSourceError("source_unavailable");
      }
      current = parseSuggestionUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new SuggestionSourceError("source_unavailable");
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      throw new SuggestionSourceError("unsupported_source");
    }

    const html = await readBoundedText(response);
    const title = extractTitle(html)?.slice(0, 300).trim();
    const body =
      html.match(
        /<(?:main|article|body)\b[^>]*>([\s\S]*?)<\/(?:main|article|body)>/i,
      )?.[1] ?? html;
    const content = stripHtml(body).slice(0, MAX_EXTRACTED_TEXT).trim();
    if (!title || content.length < 40) {
      throw new SuggestionSourceError("unsupported_source");
    }

    return {
      url: current.toString(),
      title,
      publishDate: extractPublishedDate(html) ?? undefined,
      content,
      // Do not pass remote image URLs to the local worker. A submitted HTML
      // page controls og:image and could otherwise turn the later image fetch
      // into a second-hop SSRF. Poster ingestion needs its own safe upload/OCR
      // path and is intentionally out of this URL-only flow.
      imageUrls: [],
    };
  }

  throw new SuggestionSourceError("source_unavailable");
}
