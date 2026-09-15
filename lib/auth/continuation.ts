import { locales } from '@/lib/i18n/locales';

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://dalat.app');
    return url.origin === 'https://dalat.app' ? url.pathname + url.search + url.hash : '/';
  } catch { return '/'; }
}
export function localizedPath(path: string, locale: string): string {
  const safe = safeReturnPath(path);
  if (/^\/auth\/(continue|callback)(?:[/?]|$)/.test(safe)) return safe;
  const first = safe.split('/')[1]?.split('?')[0];
  if (locales.includes(first as typeof locales[number])) return safe;
  return locale === 'en' ? safe : `/${locale}${safe}`;
}
export function authContinuation(search: URLSearchParams): string {
  const intent = search.get('intent');
  if (intent && /^[0-9a-f-]{36}$/i.test(intent)) return `/auth/continue?intent=${intent}`;
  return `/auth/continue?next=${encodeURIComponent(safeReturnPath(search.get('next') || search.get('redirect')))}`;
}
export function callbackUrl(origin: string, search: URLSearchParams): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', authContinuation(search));
  return url.toString();
}
