'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface Props {
  eventId: string;
}

const CANCEL_REASONS = [
  { id: 'schedule', label: 'Schedule conflict' },
  { id: 'sick', label: 'Not feeling well' },
  { id: 'transport', label: 'Transportation issue' },
  { id: 'other', label: 'Other reason' },
];

export function ConfirmAttendanceHandler({ eventId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'confirming' | 'confirmed' | 'cancel-reason' | 'cancelled' | 'error'>('idle');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  useEffect(() => {
    const confirm = searchParams?.get('confirm');
    const cancel = searchParams?.get('cancel');

    if (confirm === 'yes') {
      handleConfirmation(true);
    } else if (confirm === 'no' || cancel === 'true') {
      setStatus('cancel-reason');
    }
  }, [searchParams]);

  async function handleConfirmation(confirmed: boolean, reason?: string) {
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

    if (!confirmed && reason) {
      await supabase.from('rsvp_cancellations').insert({
        event_id: eventId,
        reason,
      });
    }

    setStatus(confirmed ? 'confirmed' : 'cancelled');
    cleanupUrl();
    router.refresh();
  }

  function cleanupUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('confirm');
    url.searchParams.delete('cancel');
    router.replace(url.pathname);
  }

  function handleCancelWithReason() {
    if (selectedReason) {
      handleConfirmation(false, selectedReason);
    }
  }

  function handleDismiss() {
    setStatus('idle');
    cleanupUrl();
  }

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border rounded-lg p-6 max-w-sm mx-4 text-center space-y-4">
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

        {status === 'cancel-reason' && (
          <>
            <p className="text-2xl">😢</p>
            <p className="font-medium">Sorry you can't make it!</p>
            <p className="text-sm text-muted-foreground mb-4">Mind telling us why?</p>
            <div className="space-y-2">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  className={`w-full p-3 text-left rounded-lg border transition-colors ${
                    selectedReason === reason.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleDismiss} className="flex-1">
                Keep RSVP
              </Button>
              <Button
                onClick={handleCancelWithReason}
                disabled={!selectedReason}
                className="flex-1"
              >
                Cancel RSVP
              </Button>
            </div>
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
