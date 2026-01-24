'use client';

import { useEffect, useRef } from 'react';
import { usePushNotifications } from '@/lib/hooks/use-push-notifications';
import { createClient } from '@/lib/supabase/client';

const PROMPTED_KEY = 'notification-prompted';

/**
 * Auto-subscribes logged-in users to push notifications.
 * The browser will show its native permission dialog.
 * If granted, user is subscribed. If denied, we don't ask again.
 * Users can always manage this in Settings.
 */
export function NotificationPrompt() {
  const { permission, isSubscribed, isLoading, subscribe, isSupported } = usePushNotifications();
  const hasPrompted = useRef(false);

  useEffect(() => {
    // Only run once per mount
    if (hasPrompted.current) return;

    // Don't auto-prompt if:
    // - Not supported
    // - Already subscribed
    // - Already prompted before (denied or dismissed browser dialog)
    // - Still loading
    if (!isSupported || isSubscribed || isLoading) return;
    if (permission === 'denied') return;
    if (localStorage.getItem(PROMPTED_KEY)) return;

    // Check if user is logged in
    async function checkAndPrompt() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (hasPrompted.current) return;

      hasPrompted.current = true;
      localStorage.setItem(PROMPTED_KEY, 'true');

      // Small delay to not be jarring on page load
      await new Promise(resolve => setTimeout(resolve, 1500));

      // This triggers the browser's native permission dialog
      await subscribe();
    }
    checkAndPrompt();
  }, [isSupported, isSubscribed, isLoading, permission, subscribe]);

  // This component doesn't render anything - it just auto-triggers
  return null;
}
