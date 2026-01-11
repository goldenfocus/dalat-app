# Handover: Moments UGC System

## Just Completed (Phase 1)
- Event lifecycle tabs: Upcoming/Now/Past on home feed
- DB: `get_events_by_lifecycle()` RPC in `20260118_001_lifecycle_rpc.sql`
- Components: `event-feed-tabs.tsx`, `event-lifecycle-badge.tsx`
- URL nav: `?tab=happening` or `?tab=past`

## Next: Phase 2 - Moments UGC

### User Requirements
- `/moments/[id]` - SEO-optimized content pages
- Content: photos, videos, text posts from event attendees
- Permissions: creator configures who can post (anyone/rsvp/confirmed)
- Moderation: optional approval queue per event
- Posting window: forever (no time limit)

### DB Schema Needed
```sql
-- event_settings (per-event config)
event_id uuid PK, moments_enabled bool, moments_who_can_post text, moments_require_approval bool

-- moments (UGC table)
id uuid, event_id, user_id, content_type (photo/video/text), media_url, text_content, status (pending/published/rejected/removed)
```

### Key Files to Create
- `supabase/migrations/20260119_*` - tables, RLS, storage bucket
- `lib/types/index.ts` - add Moment, EventSettings types
- `app/[locale]/moments/[id]/page.tsx` - individual moment (SEO)
- `app/[locale]/events/[slug]/moments/page.tsx` - gallery
- `app/[locale]/events/[slug]/moments/new/page.tsx` - create form
- `components/moments/*` - card, form, grid, media-upload

### Reference Plan
Full plan at: `.claude/plans/mighty-swinging-hellman.md`

### Stack
Next.js 16 + Supabase + next-intl (en/vi/fr) + Tailwind

### Mobile Touch Targets
Per CLAUDE.md: min 44x44px, use `px-3 py-2`, `active:scale-95`
