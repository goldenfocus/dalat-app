const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

export function safeVenueUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function getTikTokLink(value: string | null | undefined) {
  const url = safeVenueUrl(value);
  if (url?.protocol !== "https:" || url.port || !TIKTOK_HOSTS.has(url.hostname)) return null;

  const creator = /^\/@([\w.]+)(?:\/(video|photo)\/(\d+))?\/?$/.exec(url.pathname);
  if (creator) {
    const profile = `https://www.tiktok.com/@${creator[1]}`;
    return { profile, href: creator[2] ? `${profile}/${creator[2]}/${creator[3]}` : profile };
  }

  const shortPath = url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com"
    ? /^\/[\w-]+\/?$/
    : /^\/t\/[\w-]+\/?$/;
  return shortPath.test(url.pathname) ? { profile: null, href: `${url.origin}${url.pathname}` } : null;
}

export function splitVenueLinks(website: string | null | undefined, tiktok?: string | null) {
  const legacyTikTok = getTikTokLink(website);
  return {
    website: legacyTikTok ? null : safeVenueUrl(website)?.href ?? null,
    tiktok: getTikTokLink(tiktok) ?? legacyTikTok,
  };
}
