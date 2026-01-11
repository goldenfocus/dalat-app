'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/lib/hooks/use-push-notifications';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const DISMISSED_KEY = 'notification-prompt-dismissed';

export function NotificationPrompt() {
  const { permission, isSubscribed, isLoading, subscribe, isSupported } = usePushNotifications();
  const [dismissed, setDismissed] = useState(true); // Start hidden to prevent flash
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the prompt
    const wasDismissed = localStorage.getItem(DISMISSED_KEY);
    setDismissed(!!wasDismissed);

    // Check if user is logged in
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  // Don't show if:
  // - Not logged in
  // - Not supported
  // - Already subscribed
  // - Permission denied (they blocked it)
  // - User dismissed the prompt
  // - Still loading initial state
  if (!isLoggedIn || !isSupported || isSubscribed || permission === 'denied' || dismissed || isLoading) {
    return null;
  }

  const handleEnable = async () => {
    triggerHaptic('medium');
    setIsSubscribing(true);
    const success = await subscribe();
    setIsSubscribing(false);

    if (!success) {
      // If they denied, hide the prompt
      localStorage.setItem(DISMISSED_KEY, 'true');
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    triggerHaptic('selection');
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Enable notifications</p>
          <p className="text-xs text-muted-foreground">
            Get alerts for event reminders and updates on your device
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleEnable}
              disabled={isSubscribing}
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors",
                "hover:bg-primary/90 disabled:opacity-50"
              )}
            >
              {isSubscribing ? 'Enabling...' : 'Enable'}
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
