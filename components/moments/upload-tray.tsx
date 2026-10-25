'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Check, CloudUpload, Loader2 } from 'lucide-react';
import { Link } from '@/lib/i18n/routing';
import { useEventUploads } from './event-uploader';
import { isFinished, isWorking } from '@/lib/uploads/types';

export function UploadTray() {
  const state = useEventUploads();
  const t = useTranslations('moments.uploader');
  const pathname = usePathname();
  const uploading = state.jobs.some(job => isWorking(job.phase)) || state.staging > 0;
  useEffect(() => {
    if (!uploading || !navigator.wakeLock) return;
    let closed = false;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (closed) await next.release(); else lock = next;
      } catch { /* Low-power mode and unsupported devices still upload normally. */ }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { closed = true; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => {}); };
  }, [uploading]);
  if (!state.jobs.length || /\/moments\/new\/?$/.test(pathname)) return null;
  const unfinished = state.jobs.filter(job => !isFinished(job.phase));
  const latest = unfinished[0] || state.jobs[state.jobs.length - 1];
  const jobs = state.jobs.filter(job => job.eventId === latest.eventId);
  const done = jobs.filter(job => isFinished(job.phase)).length;
  const busy = jobs.some(job => isWorking(job.phase));
  return <Link href={`/events/${latest.eventSlug}/moments/new`}
    className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom)+1rem)] left-3 right-[5.5rem] z-[60] flex min-h-16 items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:left-auto sm:w-80 lg:bottom-5 lg:right-5"
    aria-label={t('openQueue')}>
    {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : done === jobs.length ? <Check className="h-5 w-5 shrink-0 text-primary" /> : <CloudUpload className="h-5 w-5 shrink-0" />}
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{done === jobs.length ? t('done') : t('count', { complete: done, total: jobs.length })}</p><p className="truncate text-xs text-muted-foreground">{latest.eventTitle}</p></div>
    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Link>;
}
