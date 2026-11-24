import { normalizeEventContactLink } from "./contact-link";

export const MAX_EVENT_LINKS = 20;
export type EventLinkPlatform = "zalo" | "whatsapp" | "telegram" | "facebook" | "instagram" | "youtube" | "tiktok" | "website";
export function detectEventLinkPlatform(value: string): EventLinkPlatform {
  const normalized = normalizeEventContactLink(value);
  if (!normalized) return "website";
  const host = new URL(normalized).hostname.toLowerCase();
  const matches = (...domains: string[]) => domains.some(d => host === d || host.endsWith("." + d));
  if (matches("zalo.me", "zaloapp.com")) return "zalo";
  if (matches("wa.me", "whatsapp.com")) return "whatsapp";
  if (matches("t.me", "telegram.me", "telegram.org")) return "telegram";
  if (matches("facebook.com", "fb.com", "fb.me")) return "facebook";
  if (matches("instagram.com")) return "instagram";
  if (matches("youtube.com", "youtu.be")) return "youtube";
  if (matches("tiktok.com")) return "tiktok";
  return "website";
}
/** Additional organizer links only; imported private source pointers stay separate. */
export function normalizeAdditionalEventLinks(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length >= MAX_EVENT_LINKS) throw new Error("Invalid links");
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || raw.length > 2048) throw new Error("Invalid link");
    if (!raw.trim()) continue;
    const url = normalizeEventContactLink(raw);
    if (!url) throw new Error("Invalid link");
    if (!result.includes(url)) result.push(url);
  }
  return result;
}
export function publicEventLinks(primary: string | null | undefined, additional: unknown, hidePrimary = false): string[] {
  const result: string[] = [];
  const values = [...(!hidePrimary && primary ? [primary] : []), ...(Array.isArray(additional) ? additional : [])];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const url = normalizeEventContactLink(raw);
    if (url && !result.includes(url)) result.push(url);
  }
  return result.slice(0, MAX_EVENT_LINKS);
}

/** Community/link names are organizer-provided proper names, preserved verbatim. */
export function normalizeEventLinkNames(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > MAX_EVENT_LINKS) throw new Error("Invalid link names");
  const result: Record<string, string> = {};
  for (const [raw, name] of Object.entries(value)) {
    if (typeof name !== "string" || name.trim().length > 80) throw new Error("Invalid link name");
    if (!name.trim()) continue;
    const url = normalizeEventContactLink(raw);
    if (!url) throw new Error("Invalid named link");
    result[url] = name.trim();
  }
  return result;
}

export function normalizeEventLinkImages(value: unknown): Record<string,string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > MAX_EVENT_LINKS) throw new Error("Invalid link images");
  const result: Record<string,string> = {};
  for (const [raw,image] of Object.entries(value)) {
    if (image === "") continue;
    if (typeof image !== "string" || image.length > 2048) throw new Error("Invalid link image");
    const url = normalizeEventContactLink(raw), src = normalizeEventContactLink(image);
    if (!url || !src) throw new Error("Invalid link image");
    result[url] = src;
  }
  return result;
}
export function linkedCommunitySlug(value: string): string | null {
  const url = normalizeEventContactLink(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (!["dalat.app", "www.dalat.app"].includes(parsed.hostname)) return null;
  return parsed.pathname.match(/^\/(?:[a-z]{2}\/)?(?:communities|tribes)\/([^/]+)\/?$/)?.[1] || null;
}
