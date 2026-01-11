# dalat.app

Events without the noise. Discover and organize events in Da Lat.

## Development

```bash
npm install
npm run dev
```

## Deployment

### Updating the PWA / Service Worker

When deploying new features that users need to get immediately, **update the service worker version** to trigger an automatic refresh for all users:

1. Open `public/sw.js`
2. Update the `SW_VERSION` constant:
   ```js
   const SW_VERSION = '1.0.1'; // Bump this version
   ```
3. Commit and push

**How it works:**
- When the browser detects `sw.js` has changed, it installs the new service worker
- The new SW calls `skipWaiting()` to activate immediately
- The `SwUpdateHandler` component detects the update and auto-reloads the page
- Users get the latest version without needing to close/reopen the app

### Version Bump Checklist

For major releases or breaking changes:
- [ ] Update `SW_VERSION` in `public/sw.js`
- [ ] Run database migrations if needed: `supabase db push`
- [ ] Update environment variables on Vercel if needed

## Environment Variables

Required in `.env.local` and Vercel:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Novu (notifications)
NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=
NOVU_SECRET_KEY=

# Web Push (VAPID keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=https://dalat.app
```

## Push Notifications

Push notifications are enabled by default for logged-in users. The system uses:
- **Web Push API** for native OS notifications (lock screen, notification center)
- **Novu** for in-app inbox notifications

Users can manage notifications in Settings.

## Tech Stack

- Next.js 14+ (App Router)
- Supabase (Auth, Database)
- Novu (Notification inbox)
- Web Push API (Native notifications)
- Tailwind CSS
- shadcn/ui
