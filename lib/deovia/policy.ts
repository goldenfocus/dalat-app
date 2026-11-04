// Kept identical in both applications; trust is limited to this fixed peer pair.
export type DeoviaApp = 'ezviet' | 'dalat';
export const origins = { ezviet: 'https://ezviet.org', dalat: 'https://dalat.app' } as const;
export const tokenPattern = /^[a-f0-9]{64}$/;
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function safePath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  const url = new URL(value, origins.ezviet);
  if (url.origin !== origins.ezviet || /^\/(?:[a-z]{2}\/)?auth\/deovia(?:[/?]|$)/.test(url.pathname)) return '/';
  return url.pathname + url.search + url.hash;
}
export interface PeerIdentity { id: string; email: string; name: string | null; avatar: string | null }
export function readIdentity(value: unknown): PeerIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !uuidPattern.test(v.id) || typeof v.email !== 'string' || v.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return null;
  const name = typeof v.name === 'string' ? v.name.slice(0, 120) : null;
  const avatar = typeof v.avatar === 'string' && v.avatar.length < 2048 && v.avatar.startsWith('https://') ? v.avatar : null;
  return { id: v.id, email: v.email.toLowerCase(), name, avatar };
}
