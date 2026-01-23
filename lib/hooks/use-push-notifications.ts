'use client';

import { useState, useEffect, useCallback } from 'react';

type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface UsePushNotificationsReturn {
  permission: PushPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  isSupported: boolean;
  isIOSPWA: boolean;
  isIOSSafari: boolean;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

// Detect if running on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Detect if running as installed PWA (standalone mode)
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari adds this when installed to home screen
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const isiOSDevice = isIOS();
  const isStandaloneMode = isStandalone();

  // On iOS, push is only supported in standalone PWA mode (iOS 16.4+)
  const isIOSPWA = isiOSDevice && isStandaloneMode;
  const isIOSSafari = isiOSDevice && !isStandaloneMode;

  const isSupported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Initialize: register service worker and check subscription status
  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      setIsLoading(false);
      return;
    }

    async function init() {
      try {
        // Check notification permission
        setPermission(Notification.permission as PushPermission);

        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js');
        setRegistration(reg);

        // Check if already subscribed
        const subscription = await reg.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (error) {
        console.error('Push notification init error:', error);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !registration) {
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);

      if (result !== 'granted') {
        setIsLoading(false);
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Push subscription error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, registration]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !registration) {
      return false;
    }

    setIsLoading(true);

    try {
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error('Push unsubscription error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, registration]);

  // Log for debugging iOS issues
  useEffect(() => {
    if (isiOSDevice) {
      console.log('[push] iOS device detected', {
        isStandalone: isStandaloneMode,
        isSupported,
        hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
        hasNotification: typeof window !== 'undefined' && 'Notification' in window,
      });
    }
  }, [isiOSDevice, isStandaloneMode, isSupported]);

  return {
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSupported,
    isIOSPWA,
    isIOSSafari,
  };
}
