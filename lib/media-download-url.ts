/** Only original assets on our media hosts may be proxied as downloads. */
export function isAllowedMediaDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (url.hostname === 'chicoman.com') return /^\/downloads\/videos\/[a-z0-9-]+\.(mp4|mov)$/.test(url.pathname);
    return ['cdn.dalat.app', 'aljcmodwjqlznzcydyor.supabase.co'].includes(url.hostname);
  } catch { return false; }
}
