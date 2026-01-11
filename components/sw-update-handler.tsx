'use client';

import { useEffect } from 'react';

/**
 * Listens for service worker updates and automatically reloads the page.
 * This ensures users always have the latest version of the app.
 */
export function SwUpdateHandler() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Listen for messages from the service worker
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log(`[App] New version available: ${event.data.version}`);
        // Auto-reload to get the latest version
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Also listen for controller change (backup method)
    const handleControllerChange = () => {
      console.log('[App] Service worker controller changed, reloading...');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Check for updates periodically (every 5 minutes)
    const checkForUpdates = () => {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.update().catch(() => {
            // Silently ignore update check failures
          });
        }
      });
    };

    const updateInterval = setInterval(checkForUpdates, 5 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      clearInterval(updateInterval);
    };
  }, []);

  return null;
}
