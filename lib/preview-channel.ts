import { locales } from "@/lib/i18n/locales";

/**
 * Preview channel: a redesign that can be browsed on production under its own
 * URL prefix, on any host.
 *
 *   /v3            → the preview homepage
 *   /v3/calendar   → the same route as /calendar, in the preview skin
 *   /vi/v3/map     → the same route as /vi/map
 *
 * Any single-digit version works (v3, v4, …); they all show the one preview
 * that is deployed. Three parts cooperate:
 *   - middleware.ts rewrites a channel URL to the route it stands for;
 *   - previewBootstrapScript (inline, in app/layout.tsx) turns the skin on
 *     before first paint and remembers the channel for the tab;
 *   - components/preview-channel.tsx keeps the address bar under the prefix
 *     while the visitor navigates.
 * Leave with ?preview=off on any URL (handled in middleware).
 */
export const PREVIEW_FLAG = "fog-preview";
/** Route the channel root is served from. */
export const PREVIEW_HOME = "/preview-home";

const localeGroup = locales.join("|");
const channelPattern = new RegExp(`^(?:/(${localeGroup}))?/(v[1-9])(/.*)?$`);
const localePattern = new RegExp(`^/(?:${localeGroup})(?=/|$)`);

export interface PreviewPath {
  /** "" or "/vi" */
  locale: string;
  /** "v3" */
  channel: string;
  /** "" for the channel root, otherwise "/calendar" */
  rest: string;
}

export function parsePreviewPath(pathname: string): PreviewPath | null {
  const match = pathname.match(channelPattern);
  if (!match) return null;
  return {
    locale: match[1] ? `/${match[1]}` : "",
    channel: match[2],
    rest: match[3] && match[3] !== "/" ? match[3] : "",
  };
}

/** Split "/vi/calendar" into { locale: "/vi", rest: "/calendar" }. */
export function splitLocale(pathname: string): { locale: string; rest: string } {
  const locale = pathname.match(localePattern)?.[0] ?? "";
  return { locale, rest: pathname.slice(locale.length) || "/" };
}

/** The app path a channel URL is served from. */
export function innerPath({ locale, rest }: PreviewPath): string {
  return `${locale}${rest || PREVIEW_HOME}`;
}

/** The plain app path behind a channel URL: "/vi/v3/map" → "/vi/map". */
export function stripChannel(pathname: string): string {
  const preview = parsePreviewPath(pathname);
  return preview ? `${preview.locale}${preview.rest}` || "/" : pathname;
}

/** Put a plain app path under the channel: "/vi/map" → "/vi/v3/map". */
export function withChannel(pathname: string, channel: string): string {
  if (parsePreviewPath(pathname)) return pathname;
  const { locale, rest } = splitLocale(pathname);
  const tail = rest === "/" || rest === PREVIEW_HOME ? "" : rest;
  return `${locale}/${channel}${tail}`;
}

/**
 * Runs inline in <head>, before first paint. Kept dependency-free and in step
 * with the helpers above:
 *   - a channel URL (or a tab that already entered one) gets the .fog skin;
 *   - a plain URL loaded inside a preview tab is put back under the prefix
 *     (the homepage is a real navigation, since the preview has its own).
 */
export const previewBootstrapScript = `(()=>{try{
var l=location,s=sessionStorage,k=${JSON.stringify(PREVIEW_FLAG)};
var m=l.pathname.match(/^(?:\\/(?:${localeGroup}))?\\/(v[1-9])(?=\\/|$)/);
var c=m?m[1]:s.getItem(k);if(!c)return;
s.setItem(k,c);document.documentElement.classList.add('fog');
if(m)return;
var loc=(l.pathname.match(/^\\/(?:${localeGroup})(?=\\/|$)/)||[''])[0],rest=l.pathname.slice(loc.length);
if(!rest||rest==='/'){l.replace(loc+'/'+c+l.search+l.hash);return}
History.prototype.replaceState.call(history,history.state,'',loc+'/'+c+rest+l.search+l.hash);
}catch(e){}})();`;
