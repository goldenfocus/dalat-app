/** Only original assets on our media hosts may be proxied as downloads. */
export function isAllowedMediaDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (url.hostname === 'chicoman.com') return /^\/downloads\/videos\/[a-z0-9-]+\.(mp4|mov)$/.test(url.pathname);
    return ['cdn.dalat.app', 'aljcmodwjqlznzcydyor.supabase.co'].includes(url.hostname);
  } catch { return false; }
}

/** Keep originals available while a smaller viewing copy serves mobile saves. */
export function selectMediaDownloadUrl(moment: {media_url: string | null; file_url?: string | null; content_type: string}, quality: string | null): string | null {
  if (quality !== "mobile" && ["video", "youtube"].includes(moment.content_type) && moment.file_url && isAllowedMediaDownloadUrl(moment.file_url)) return moment.file_url;
  return moment.media_url;
}
