# Session Handover: dalat.app

## Project Overview
**dalat.app** is a community events platform for Đà Lạt, Vietnam. Think Luma/Partiful but localized for the Vietnamese market with trilingual support.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **i18n**: next-intl (en/vi/fr)
- **Styling**: Tailwind CSS + shadcn/ui
- **Hosting**: Vercel + Supabase Cloud

## Key Directories
```
app/[locale]/           # Localized pages
components/             # React components
  ├── events/           # Event-related components
  ├── moments/          # UGC moments components
  ├── admin/            # Admin dashboard
  └── ui/               # shadcn/ui primitives
lib/
  ├── supabase/         # Supabase client (server.ts, client.ts)
  ├── types/index.ts    # All TypeScript types
  └── i18n/             # Internationalization
supabase/migrations/    # SQL migrations (date-prefixed)
messages/               # Translation files (en.json, vi.json, fr.json)
```

## Recently Completed: Event Settings UI

### What It Does
Event creators can now configure moments for their events via a dedicated settings page:
- **Enable/disable moments** - Toggle to allow UGC on the event
- **Who can post** - Anyone / RSVPed only / Confirmed attendees only
- **Require approval** - Optional moderation queue before publishing

### Key Files
- **Page**: `app/[locale]/events/[slug]/settings/page.tsx`
- **Form Component**: `components/events/event-settings-form.tsx`
- **Menu Integration**: `components/events/event-actions.tsx` (added Settings link)
- **Translations**: `eventSettings` namespace in en/vi/fr.json

### How to Access
Event creator clicks ⋯ menu on their event → "Event settings"

### Database
Uses existing `event_settings` table (upsert pattern - creates if missing):
```sql
event_settings (event_id PK, moments_enabled, moments_who_can_post, moments_require_approval)
```

## Previously Completed: Moments UGC System

### What It Does
- Users can post photos, videos, and text moments from events
- Event creators control who can post (anyone/rsvp/confirmed)
- Optional moderation queue with approval workflow
- SEO-optimized individual moment pages

### Key Files
- **Migration**: `supabase/migrations/20260119_001_moments_ugc.sql`
- **Types**: `lib/types/index.ts` (Moment, EventSettings, MomentCounts)
- **Components**: `components/moments/` (MomentCard, MomentGrid, MomentForm, MomentsPreview)
- **Pages**:
  - `app/[locale]/events/[slug]/moments/page.tsx` - Gallery
  - `app/[locale]/events/[slug]/moments/new/page.tsx` - Create form
  - `app/[locale]/moments/[id]/page.tsx` - Individual moment (SEO)

### RPC Functions
- `get_event_moments(event_id, limit, offset)` - Fetch published moments
- `get_moment_counts(event_id)` - Get counts (shows pending to creator)
- `create_moment(event_id, content_type, media_url, text_content)` - Create with auto-publish
- `can_post_moment(event_id)` - Permission check helper

## Coding Conventions

### Mobile-First Touch Targets (CLAUDE.md)
All interactive elements need 44x44px minimum:
```tsx
<Link className="-ml-3 flex items-center gap-2 px-3 py-2 active:scale-95 transition-all rounded-lg">
```

### Server/Client Components
- Pages are Server Components by default
- Add `"use client"` only when needed (hooks, interactivity)
- Fetch data in Server Components, pass to Client Components

### Supabase Patterns
```tsx
// Server-side
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Client-side
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

### Translations
```tsx
// Server Components
import { getTranslations } from "next-intl/server";
const t = await getTranslations("namespace");

// Client Components
import { useTranslations } from "next-intl";
const t = useTranslations("namespace");
```

## Next Tasks (Priority Order)

### 1. Moderation UI (High Priority)
Event creators need a panel to approve/reject pending moments when `moments_require_approval` is enabled.

**Suggested approach:**
- Add moderation tab/section to event settings or moments gallery
- Show pending moments with approve/reject buttons
- Update moment status via Supabase (RLS already configured)
- Use existing `moments.moderation` translations

### 2. Infinite Scroll (Medium Priority)
Pagination for galleries with many moments. Currently fetches all at once.

### 3. Reactions/Likes (Medium Priority)
Let users like/heart moments - would need new DB table.

### Other Features in Backlog
- Push notification improvements
- Festival pages enhancements
- Event analytics for organizers
- Social sharing improvements

## Running Locally
```bash
npm run dev          # Start dev server
npm run lint         # ESLint
npx supabase db push # Apply migrations
```

## Key Reference Files
- `CLAUDE.md` - Project conventions and patterns
- `docs/handover-moments-ugc.md` - Moments feature details
- `lib/types/index.ts` - All TypeScript types
- `supabase/migrations/20260119_001_moments_ugc.sql` - Moments schema

## Current State
- Event Settings UI committed and pushed to `main` (commit `ab09aa6`)
- All Moments UGC code is on `main`
- `docs/handover-admin-analytics.md` has uncommitted changes (unrelated to moments)
- No open PRs
