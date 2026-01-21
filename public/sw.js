// Service Worker for dalat.app
// Handles push notifications, app updates, and caching for PageSpeed
//
// IMPORTANT: Update SW_VERSION when deploying new features
// This triggers the update flow for all users
const SW_VERSION = '1.0.2';

const APP_URL = self.location.origin;

// Cache names
const STATIC_CACHE = 'dalat-static-v1';
const IMAGE_CACHE = 'dalat-images-v1';

// Static assets to precache (improves FCP on repeat visits)
const PRECACHE_ASSETS = [
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/manifest.json',
];

// Install: Precache critical assets
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${SW_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version ${SW_VERSION}`);
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== IMAGE_CACHE)
            .map(key => caches.delete(key))
        )
      ),
      // Claim all clients
      clients.claim().then(() => {
        clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
          });
        });
      }),
    ])
  );
});

// Fetch: Cache images for faster LCP on repeat visits
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Cache Cloudflare-optimized images (LCP optimization)
  if (url.pathname.startsWith('/cdn-cgi/image/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            // Only cache successful responses
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Cache static assets (fonts, icons)
  if (
    url.pathname.match(/\.(woff2?|png|svg|ico)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(request).then(cached => {
          // Stale-while-revalidate for static assets
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

// Vibration pattern: vibrate 100ms, pause 50ms, vibrate 100ms
const VIBRATION_PATTERN = [100, 50, 100];

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received!', event);

  if (!event.data) {
    console.log('[SW] Push had no data');
    return;
  }

  const data = event.data.json();
  console.log('[SW] Push data:', data);

  // Notification mode: sound_and_vibration, sound_only, vibration_only, silent
  const mode = data.notificationMode || 'sound_and_vibration';

  // Determine vibration based on mode
  const shouldVibrate = mode === 'sound_and_vibration' || mode === 'vibration_only';

  // Determine if silent (no sound) based on mode
  const shouldBeSilent = mode === 'vibration_only' || mode === 'silent';

  const options = {
    body: data.body,
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    data: {
      url: data.url || APP_URL,
      notificationId: data.notificationId,
    },
    actions: data.actions || [],
    tag: data.tag || 'default', // Replaces notifications with same tag
    renotify: true, // Re-alert even if notification with same tag exists
    requireInteraction: data.requireInteraction || false,
    // Apply notification mode settings
    silent: shouldBeSilent,
  };

  // Only add vibrate if mode allows vibration
  if (shouldVibrate) {
    options.vibrate = VIBRATION_PATTERN;
  }

  // Set badge count if provided
  if (data.badgeCount !== undefined && 'setAppBadge' in navigator) {
    navigator.setAppBadge(data.badgeCount).catch(() => {});
  }

  console.log('[SW] Showing notification:', data.title, options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] Notification shown successfully'))
      .catch(err => console.error('[SW] Failed to show notification:', err))
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
