'use client';

import { Inbox } from '@novu/nextjs';
import { inboxDarkTheme } from '@novu/react/themes';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface NotificationInboxProps {
  subscriberId: string;
  subscriberHash: string;
}

export function NotificationInbox({ subscriberId, subscriberHash }: NotificationInboxProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Debug: log what we're using
    console.log('[Novu] Inbox mounting with:', {
      applicationIdentifier: process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER,
      subscriberId,
      subscriberHash: subscriberHash ? `${subscriberHash.substring(0, 8)}...` : 'missing',
    });
  }, [subscriberId, subscriberHash]);

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Inbox
      applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER!}
      subscriberId={subscriberId}
      // subscriberHash={subscriberHash} // Enable once HMAC is turned on in Novu dashboard
      appearance={{
        baseTheme: isDark ? inboxDarkTheme : undefined,
        variables: {
          colorPrimary: isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 9%)',
          colorPrimaryForeground: isDark ? 'hsl(0 0% 9%)' : 'hsl(0 0% 98%)',
          colorSecondary: isDark ? 'hsl(0 0% 14.9%)' : 'hsl(0 0% 96.1%)',
          colorSecondaryForeground: isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 9%)',
          colorBackground: isDark ? 'hsl(0 0% 3.9%)' : 'hsl(0 0% 100%)',
          colorForeground: isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 3.9%)',
          colorNeutral: isDark ? 'hsl(0 0% 14.9%)' : 'hsl(0 0% 89.8%)',
          colorRing: isDark ? 'hsl(0 0% 83.1%)' : 'hsl(0 0% 3.9%)',
          fontSize: '14px',
        },
        elements: {
          bellIcon: {
            width: '20px',
            height: '20px',
          },
        },
      }}
    />
  );
}
