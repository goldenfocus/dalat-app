import { isDefaultImageUrl } from '@/lib/media-utils';
export function safeCommunityImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^\/images\/communities\/[a-z0-9._-]+\.(png|jpe?g|webp)$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const allowed = ['cdn.dalat.app','imagedelivery.net','dalat.app'];
    if (!allowed.includes(url.hostname) && !(url.hostname === 'aljcmodwjqlznzcydyor.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/'))) return null;
    return isDefaultImageUrl(value) ? null : value;
  } catch { return null; }
}
export function communityPreviewImages(cover: unknown, event: unknown, featured: unknown): string[] {
  return [...new Set([cover,event,featured].map(safeCommunityImage).filter((v): v is string => !!v))];
}
export function isUpcomingGathering(event: { starts_at: string; ends_at?: string | null }, now = Date.now()): boolean {
  const end = event.ends_at ? Date.parse(event.ends_at) : Date.parse(event.starts_at) + 4 * 3600000;
  return Number.isFinite(end) && end >= now;
}
