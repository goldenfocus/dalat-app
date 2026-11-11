# dalat.app

Events · People · Moments · Love · Đà Lạt 🇻🇳

## Development

```bash
npm ci        # clean, reproducible install from package-lock.json
npm run dev
```

### Package manager and lockfile

npm is the only package manager. `package-lock.json` is the single lockfile; Vercel detects npm from it (`vercel.json` sets no install command).

- Clean installs and CI use `npm ci`. It fails when the lock and `package.json` disagree, which is the point.
- To add or change a dependency, run `npm install <pkg>` and commit `package.json` and `package-lock.json` together.
- Do not commit `bun.lock`, `yarn.lock` or `pnpm-lock.yaml` (they are gitignored). `bun run <script>` as a TypeScript runner is fine; `bun install` is not.
- Next.js is held on the 16.2.x line (`~16.2.10`). On Next 16.4 the Turbopack build cannot resolve the dynamic worker URL in `@ffmpeg/ffmpeg` (used by `lib/video-compression.ts`). Fix that import before widening the range.

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

Automated Scout / WhatsApp drafts and the Review publish+QA gate: `docs/handover/scout-review-ingest.md`. That lane is separate from Activity Graph.

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

New public tables need an explicit Data API grant in the same migration. See `supabase/migrations/README.md`.

## Tech Stack

- Next.js 16+ (App Router)
- Supabase (Auth, Database)
- Inngest (background jobs/scheduling)
- Web Push API (Native notifications)
- Tailwind CSS
- shadcn/ui
## Credits

Built by [@vibeyang](https://github.com/vibeyang) with [Claude Code](https://claude.com/claude-code).

**Development philosophy:** Every feature is built by spawning a **team of specialized agents** working in parallel. Instead of one AI doing everything sequentially, Claude Code assembles a squad — each agent is an expert in its domain (database migrations, UI components, API routes, i18n, testing, code review). The goal: **speed through parallelism, accuracy through specialization, and quality through expert review.** A single feature request can trigger 3-5 agents running simultaneously, each owning their piece of the stack.
