// Service Worker for dalat.app
// Handles push notifications and app updates
//
// IMPORTANT: Update SW_VERSION when deploying new features
// This triggers the update flow for all users
const SW_VERSION = '1.0.0';

const APP_URL = self.location.origin;

// Install: Take over immediately (don't wait for old SW to die)
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${SW_VERSION}`);
  self.skipWaiting();
});

// Activate: Claim all clients immediately
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version ${SW_VERSION}`);
  event.waitUntil(
    clients.claim().then(() => {
      // Notify all clients that a new version is active
      clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        });
      });
    })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    vibrate: [100, 50, 100], // vibration pattern: vibrate, pause, vibrate
    data: {
      url: data.url || APP_URL,
      notificationId: data.notificationId,
    },
    actions: data.actions || [],
    tag: data.tag || 'default', // Replaces notifications with same tag
    renotify: true, // Re-alert even if notification with same tag exists
    requireInteraction: data.requireInteraction || false,
  };

  // Set badge count if provided
  if (data.badgeCount !== undefined && 'setAppBadge' in navigator) {
    navigator.setAppBadge(data.badgeCount).catch(() => {});
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || APP_URL;

  // Handle action button clicks
  if (event.action) {
    const action = event.notification.data?.actions?.find(a => a.action === event.action);
    if (action?.url) {
      event.waitUntil(clients.openWindow(action.url));
      return;
    }
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          client.focus();
          if (url !== APP_URL) {
            client.navigate(url);
          }
          return;
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});

// Handle notification close (for analytics if needed)
self.addEventListener('notificationclose', (event) => {
  // Could send analytics here
});

// Handle push subscription change (browser may rotate keys)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then((subscription) => {
        // Re-register with server
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
      })
  );
});
