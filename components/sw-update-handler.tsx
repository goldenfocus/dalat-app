'use client';

import { useEffect, useRef } from 'react';

/**
 * Listens for service worker updates and automatically reloads the page.
 * Only reloads on UPDATES (old SW → new SW), not on first install.
 * This is critical for PageSpeed - first-time visitors should not experience a reload.
 */
export function SwUpdateHandler() {
  // Track if we had a controller when component mounted
  // If no initial controller, this is a first-time install (don't reload)
  const hadInitialController = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Record if there was already a controller when we mounted
    // This distinguishes first-time install from actual updates
    hadInitialController.current = !!navigator.serviceWorker.controller;

    // Listen for messages from the service worker
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        // Only reload if this is an UPDATE (we had a previous controller)
        // Skip reload for first-time installs (fixes PageSpeed redirect penalty)
        if (hadInitialController.current) {
          console.log(`[App] New version available: ${event.data.version}, reloading...`);
          window.location.reload();
        } else {
          console.log(`[App] First-time SW install: ${event.data.version}, skipping reload`);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Listen for controller change - only reload if this is an update, not first install
    const handleControllerChange = () => {
      if (hadInitialController.current) {
        console.log('[App] Service worker controller changed, reloading...');
        window.location.reload();
      } else {
        console.log('[App] First-time SW activation, skipping reload');
        // Now we have a controller, mark for future updates
        hadInitialController.current = true;
      }
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
