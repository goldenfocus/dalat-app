'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useRouter } from '@/lib/i18n/routing';

/** Celebrate a batch observed in progress, never an old restored receipt. */
export function useUploadCompletion(eventId: string, eventSlug: string, unfinished: boolean, allDone: boolean) {
  const router = useRouter();
  const armed = useRef(false);
  const celebrated = useRef(false);
  useEffect(() => {
    armed.current = false;
    celebrated.current = false;
  }, [eventId]);
  useEffect(() => {
    if (unfinished) {
      armed.current = true;
      celebrated.current = false;
    }
    if (!allDone || !armed.current) return;
    if (!celebrated.current) {
      celebrated.current = true;
      void confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, disableForReducedMotion: true });
    }
    const readyAt = Date.now() + 1500;
    const timer = window.setInterval(() => {
      // Let a caption edit finish and don't navigate a backgrounded phone tab.
      if (Date.now() < readyAt || document.visibilityState === 'hidden' ||
        document.querySelector('[data-caption-editing]') ||
        document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
      window.clearInterval(timer);
      armed.current = false;
      router.replace(`/events/${eventSlug}/moments`);
      router.refresh();
    }, 250);
    return () => window.clearInterval(timer);
  }, [allDone, unfinished, eventSlug, router]);
}
