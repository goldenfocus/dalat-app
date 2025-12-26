'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  eventId: string;
}

export function ConfirmAttendanceHandler({ eventId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'confirming' | 'confirmed' | 'cancelled' | 'error'>('idle');

  useEffect(() => {
    const confirm = searchParams.get('confirm');
    if (confirm === 'yes' || confirm === 'no') {
      handleConfirmation(confirm === 'yes');
    }
  }, [searchParams]);

  async function handleConfirmation(confirmed: boolean) {
    setStatus('confirming');
    const supabase = createClient();

    const { error } = await supabase.rpc('confirm_attendance', {
      p_event_id: eventId,
      p_confirmed: confirmed,
    });

    if (error) {
      setStatus('error');
      return;
    }

    setStatus(confirmed ? 'confirmed' : 'cancelled');

    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('confirm');
    router.replace(url.pathname);
    router.refresh();
  }

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border rounded-lg p-6 max-w-sm mx-4 text-center space-y-2">
        {status === 'confirming' && (
          <p className="text-muted-foreground">Processing...</p>
        )}
        {status === 'confirmed' && (
          <>
            <p className="text-2xl">✅</p>
            <p className="font-medium">You're confirmed!</p>
            <p className="text-sm text-muted-foreground">See you there!</p>
          </>
        )}
        {status === 'cancelled' && (
          <>
            <p className="text-2xl">👋</p>
            <p className="font-medium">No problem!</p>
            <p className="text-sm text-muted-foreground">Your RSVP has been cancelled.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-2xl">❌</p>
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm text-muted-foreground">Please try again.</p>
          </>
        )}
      </div>
    </div>
  );
}
