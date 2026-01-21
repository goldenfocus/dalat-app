'use client';

import dynamic from 'next/dynamic';
import { inboxDarkTheme } from '@novu/react/themes';
import { useTheme } from 'next-themes';

// Dynamically import Inbox with SSR disabled to prevent hydration mismatch
const Inbox = dynamic(
  () => import('@novu/nextjs').then((mod) => mod.Inbox),
  {
    ssr: false,
    loading: () => <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
  }
);

interface NotificationInboxProps {
  subscriberId: string;
  subscriberHash: string;
}

export function NotificationInbox({ subscriberId, subscriberHash }: NotificationInboxProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Inbox
      applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER!}
      subscriberId={subscriberId}
      // subscriberHash={subscriberHash} // Disabled - not configured in Novu dashboard
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
            color: isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 9%)',
            fill: 'currentColor',
          },
        },
      }}
    />
  );
}
