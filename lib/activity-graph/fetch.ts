import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ActivitySource } from "./types";

const USER_AGENT = "DalatActivityGraph/0.1 (+https://dalat.app/about)";
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface FetchedSourceDocument {
  url: string;
  status: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  text: string;
}

function validateSourceUrl(value: string, source: ActivitySource): URL {
  const base = new URL(source.canonical_url);
  const url = new URL(value, base);
  if (url.protocol !== "https:")
    throw new Error("Only HTTPS activity sources are allowed");
  if (url.username || url.password)
    throw new Error("Source URLs cannot contain credentials");
  if (url.origin !== base.origin)
    throw new Error("Cross-origin activity-source fetch blocked");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Private activity-source address blocked");
  }
  return url;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPublicActivitySourceAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;

  let expanded = normalized;
  if (expanded.includes(".")) {
    const lastColon = expanded.lastIndexOf(":");
    const ipv4 = expanded
      .slice(lastColon + 1)
      .split(".")
      .map(Number);
    if (
      ipv4.length !== 4 ||
      ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    expanded = `${expanded.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = expanded.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return false;
  }
  const parts = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part || "0", 16));
  if (
    parts.length !== 8 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)
  )
    return false;

  if (parts.every((part) => part === 0)) return false;
  if (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)
    return false;
  const first = parts[0];
  if ((first & 0xfe00) === 0xfc00) return false; // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xffc0) === 0xfec0) return false; // deprecated site-local
  if ((first & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false; // documentation
  if (parts[0] === 0x0064 && parts[1] === 0xff9b && parts[2] === 1)
    return false;
  if (parts[0] === 0x2002 || (parts[0] === 0x2001 && parts[1] === 0))
    return false;

  const ipv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (ipv4Mapped) {
    return isPublicIpv4(
      `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`,
    );
  }
  // Deprecated IPv4-compatible addresses are unnecessary for first-party web
  // sources and make destination validation ambiguous.
  if (parts.slice(0, 6).every((part) => part === 0)) return false;
  return true;
}

async function assertPublicSourceResolution(
  url: URL,
  timeoutMs: number,
): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicActivitySourceAddress(hostname)) {
      throw new Error("Private activity-source address blocked");
    }
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Activity source DNS lookup timed out")),
          Math.max(1, Math.min(timeoutMs, 3_000)),
        );
      }),
    ]);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicActivitySourceAddress(address))
    ) {
      throw new Error("Private activity-source address blocked");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Private activity-source address blocked" ||
        error.message === "Activity source DNS lookup timed out")
    )
      throw error;
    throw new Error("Activity source hostname could not be resolved");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Source response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("activity source size limit");
      throw new Error(`Source response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function fetchSourceText(
  source: ActivitySource,
  requestedUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<FetchedSourceDocument> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let url = validateSourceUrl(requestedUrl, source);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    await assertPublicSourceResolution(url, timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept:
            "text/html, application/ld+json, application/xml, text/xml;q=0.9, */*;q=0.1",
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location)
          throw new Error(
            `Source returned HTTP ${response.status} without Location`,
          );
        url = validateSourceUrl(new URL(location, url).toString(), source);
        continue;
      }
      if (!response.ok)
        throw new Error(`Source returned HTTP ${response.status}`);

      const contentType = response.headers.get("content-type");
      if (
        contentType &&
        !/(text\/html|application\/(?:ld\+json|xml)|text\/xml)/i.test(
          contentType,
        )
      ) {
        throw new Error(`Unsupported source content type: ${contentType}`);
      }
      const text = await readBounded(response, maxBytes);
      return {
        url: url.toString(),
        status: response.status,
        contentType,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        text,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many source redirects");
}
