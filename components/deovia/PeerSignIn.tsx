"use client";
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
export function PeerSignIn() {
  const [enabled, setEnabled] = useState(false);
  const t = useTranslations('auth');
  useEffect(() => { let active = true; void fetch('/api/deovia/status', { cache: 'no-store' }).then(r => r.json()).then(d => { if (active) setEnabled(d.available === true); }).catch(() => {}); return () => { active = false; }; }, []);
  if (!enabled) return null;
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const next = query.get('redirectTo') || query.get('next') || (location.pathname.includes('login') ? '/' : location.pathname + location.search);
  return <a className="mt-4 flex min-h-11 items-center justify-center text-sm underline underline-offset-4" href={`/auth/deovia/start?mode=link&next=${encodeURIComponent(next)}`}>{t('deoviaContinue')}</a>;
}
