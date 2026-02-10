# dalat.app

Events · People · Moments · Love · Đà Lạt 🇻🇳

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
NEXT_PUBLIC_SUPABASE_URL=          # Used by both client AND server code
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Server-only: admin ops (storage uploads, bypassing RLS)

# AI Services
GOOGLE_AI_API_KEY=                 # Gemini API for cover image generation
ANTHROPIC_API_KEY=                 # Claude API for text enhancement

# Inngest (scheduled jobs)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Web Push (VAPID keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=https://dalat.app
```

**Note:** Server-side code uses `NEXT_PUBLIC_SUPABASE_URL` directly—no separate `SUPABASE_URL` needed. The `NEXT_PUBLIC_` prefix just means it's safe to expose to the browser; it works fine server-side too.

## Push Notifications

Push notifications are enabled by default for logged-in users. The system uses:
- **Web Push API** for native OS notifications (lock screen, notification center)
- **Supabase notifications table + Realtime** for in-app notifications
- **Inngest + scheduled_notifications** for reminder scheduling

Users can manage notifications in Settings.

## Claude Code Notes

**Supabase CLI Access:** The Supabase CLI is logged in and linked to this project. You can run migrations and database commands directly:
- `npx supabase db push` - Push pending migrations
- `npx supabase migration list` - List migration status
- For direct SQL, use the Management API (token is in macOS Keychain under "Supabase CLI")

## Tech Stack

- Next.js 16+ (App Router)
- Supabase (Auth, Database)
- Inngest (background jobs/scheduling)
- Web Push API (Native notifications)
- Tailwind CSS
- shadcn/ui
// Force rebuild - Sun Feb  8 10:01:51 AM UTC 2026
// Dependencies installed - Sun Feb  8 10:08:34 AM UTC 2026
