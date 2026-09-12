'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { startSignupIntent } from '@/lib/auth/start-intent';
export function ProfileJoinButton({ username }: { username: string }) {
  const t = useTranslations('profile');
  const [pending, setPending] = useState(false);
  const [failed,setFailed] = useState(false);
  return <div className="space-y-2">
    <Button disabled={pending} onClick={async () => {
      setPending(true); setFailed(false);
      try { await startSignupIntent({ kind: 'profile', slug: username }); }
      catch { setPending(false); setFailed(true); }
    }}>{t('joinDalat')}</Button>
    {failed && <p role="alert" className="text-sm text-destructive">{t('privacySaveFailed')}</p>}
  </div>;
}
