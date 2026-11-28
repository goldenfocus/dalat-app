'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Toaster, toast } from 'sonner';
import { useRouter } from '@/lib/i18n/routing';
import { isWorking } from '@/lib/uploads/types';
import { UploadNoticeTracker } from '@/lib/uploads/notices';
import { planResume, resumeNoticeDue } from '@/lib/uploads/resume';
import { useEventUploads } from './event-uploader';

const openedAt = Date.now();

/** Keep the queue running without reserving any space over the page or player. */
export function UploadNotifications() {
  const state = useEventUploads();
  const t = useTranslations('moments.uploader');
  const common = useTranslations('common');
  const router = useRouter();
  const tracker = useRef(new UploadNoticeTracker());
  const userId = useRef(state.userId);
  const noticeIds = useRef(new Set<string>());
  const resumed = useRef<string | null>(null);
  const uploading = state.staging > 0 || state.jobs.some(job => isWorking(job.phase));

  useEffect(() => {
    if (!uploading || !navigator.wakeLock) return;
    let closed = false;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (closed) await next.release(); else lock = next;
      } catch { /* Uploads keep their existing pause/resume behavior. */ }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { closed = true; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => {}); };
  }, [uploading]);

  useEffect(() => {
    if (userId.current !== state.userId) {
      for (const id of noticeIds.current) toast.dismiss(id);
      noticeIds.current.clear();
      tracker.current = new UploadNoticeTracker();
      userId.current = state.userId;
    }
    if (!state.ready || !state.userId) return;
    // Opening the app with unfinished uploads: they restart on their own (files
    // are saved on-device), so say so once. The tracker then reports completion.
    if (resumed.current !== state.userId) {
      const plan = planResume(state.jobs, state.userId, openedAt);
      if (resumeNoticeDue(resumed.current, state.userId, plan)) {
        resumed.current = state.userId;
        const id = `upload:${state.userId}:resume`;
        noticeIds.current.add(id);
        toast.info(t('resumeNotice', { count: plan.count }), { id, toasterId: 'uploads', className: 'upload-status-toast',
          description: plan.eventTitle ?? t('resumeMany', { events: plan.events }), duration: 6000, closeButton: true, dismissible: true,
          ...(plan.eventSlug ? { action: { label: t('openQueue'), onClick: () => router.push(`/events/${plan.eventSlug}/moments/new`) } } : {}) });
      }
    }
    for (const notice of tracker.current.update(state.jobs, state.staging)) {
      const id = `upload:${state.userId}:${notice.id}`;
      noticeIds.current.add(id);
      const needsQueue = notice.phase === 'error' || notice.phase === 'paused';
      const title = notice.phase === 'error' ? t('attentionNotice')
        : notice.phase === 'paused' ? t('status.paused')
        : notice.phase === 'processing' ? t('done')
        : notice.phase === 'pending' ? t('status.pending') : t('readyNotice');
      const options = {
        id, toasterId: 'uploads', className: 'upload-status-toast',
        description: notice.phase === 'processing' ? t('status.processing') : notice.eventTitle,
        duration: needsQueue ? 8000 : 5000, closeButton: true, dismissible: true,
        action: {
          label: needsQueue ? t('openQueue') : t('view'),
          onClick: () => router.push(`/events/${notice.eventSlug}/moments${needsQueue ? '/new' : ''}`),
        },
      };
      if (notice.phase === 'error') toast.error(title, options);
      else if (notice.phase === 'complete') toast.success(title, options);
      else toast.info(title, options);
    }
  }, [state, router, t]);

  return <Toaster id="uploads" className="upload-notifications" position="top-center" closeButton
    containerAriaLabel={common('upload')} visibleToasts={1}
    mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
    toastOptions={{
      closeButtonAriaLabel: common('close'),
      classNames: { closeButton: '!static !translate-x-0 !translate-y-0 !order-last !ml-auto !min-h-11 !min-w-11 !shrink-0' },
      style: { background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' },
    }} />;
}
