# Novu Elimination Mission

You are migrating dalat-app from Novu to a custom notification system. This prompt runs in a loop until complete.

## Your Mission

Replace ALL Novu functionality with:
- **In-App**: Supabase `notifications` table + Realtime
- **Push**: Keep existing `web-push` npm package (it works!)
- **Email**: Resend API
- **Scheduling**: Inngest (event-driven, no cron)
- **Preferences**: Let users choose their notification channels

## Architecture Reference

See: `.claude/plans/optimized-exploring-starfish.md` for full architecture details.

## Completion Criteria (ALL must be true)

Before outputting the completion promise, verify:

1. **No Novu in code**:
   - `grep -r "@novu" --include="*.ts" --include="*.tsx"` returns nothing
   - `grep -r "getNovu" --include="*.ts"` returns nothing
   - No `@novu/*` packages in `package.json`

2. **Database ready**:
   - `notifications` table exists with RLS
   - `notification_preferences` table exists with RLS
   - Realtime enabled on `notifications`

3. **New system functional**:
   - `lib/notifications/` directory exists with:
     - `index.ts` - main `notify()` function
     - `types.ts` - TypeScript types
     - `channels/in-app.ts` - Supabase insert
     - `channels/push.ts` - web-push (migrated from lib/web-push.ts)
     - `channels/email.ts` - Resend integration
     - `preferences.ts` - user preference checking
   - All 11 notification types have template functions

4. **UI working**:
   - `components/notifications/notification-bell.tsx` exists
   - Bell component uses Supabase Realtime
   - Replaced in `components/auth-button.tsx`

5. **API routes updated**:
   - All routes that triggered Novu now use new `notify()` function
   - Routes: `/api/notifications/rsvp`, `/api/events/[slug]/invitations`, etc.

6. **Scheduling set up**:
   - Inngest installed and configured
   - Scheduled notification functions created
   - `/api/inngest` route exists

7. **Build passes**:
   - `npm run build` succeeds
   - No TypeScript errors

## Iteration Strategy

Each iteration, assess current state and work on the NEXT incomplete item:

### Phase 1: Foundation (do first)
- [ ] Create migration file: `supabase/migrations/[timestamp]_notifications_system.sql`
- [ ] Create `lib/notifications/types.ts`
- [ ] Create `lib/notifications/channels/in-app.ts`
- [ ] Move web-push to `lib/notifications/channels/push.ts`
- [ ] Create `lib/notifications/channels/email.ts` (Resend)
- [ ] Create `lib/notifications/preferences.ts`
- [ ] Create `lib/notifications/index.ts` (main orchestrator)

### Phase 2: Templates
- [ ] Create templates for all 11 notification types with i18n support
- [ ] Templates should generate content for all channels (in-app, push, email)

### Phase 3: UI
- [ ] Create `components/notifications/notification-bell.tsx`
- [ ] Create `components/notifications/notification-item.tsx`
- [ ] Integrate into `components/auth-button.tsx`
- [ ] Remove `components/notification-inbox.tsx`

### Phase 4: Scheduling
- [ ] Install and configure Inngest
- [ ] Create `lib/inngest/client.ts`
- [ ] Create `lib/inngest/functions/reminders.ts`
- [ ] Create `/app/api/inngest/route.ts`

### Phase 5: Migration
- [ ] Update `/app/api/notifications/rsvp/route.ts`
- [ ] Update `/app/api/events/[slug]/invitations/route.ts`
- [ ] Update `/app/api/invite/[token]/rsvp/route.ts`
- [ ] Update `/app/api/tribes/[slug]/membership/route.ts`
- [ ] Update any other files importing from `lib/novu.ts`

### Phase 6: Cleanup
- [ ] `npm uninstall @novu/node @novu/nextjs @novu/react`
- [ ] Delete `lib/novu.ts` (after extracting any needed code)
- [ ] Delete `components/notification-inbox.tsx`
- [ ] Remove `NOVU_SECRET_KEY` references from docs
- [ ] Update `CLAUDE.md` if needed

### Phase 7: Verify
- [ ] Run `npm run build` - must pass
- [ ] Run `grep -r "@novu" --include="*.ts" --include="*.tsx"` - must return nothing
- [ ] Verify package.json has no @novu packages

## Key Files to Reference

- Current Novu implementation: `lib/novu.ts`
- Current web-push: `lib/web-push.ts`
- Novu inbox component: `components/notification-inbox.tsx`
- Auth button (where inbox is used): `components/auth-button.tsx`
- RSVP notifications: `app/api/notifications/rsvp/route.ts`
- Event invitations: `app/api/events/[slug]/invitations/route.ts`

## i18n Requirement

The app supports 12 locales: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id

Currently only en, fr, vi have notification translations. Maintain at minimum en, and structure templates to support future translations.

## Mobile-First (from CLAUDE.md)

All interactive elements need 44x44px touch targets. Use:
- `px-3 py-2` for padding
- `active:scale-95` for touch feedback
- `-ml-3` negative margins to maintain visual alignment

## When Complete

After ALL criteria are met and build passes, output:

```
<promise>NOVU_ELIMINATED</promise>
```

## Current Iteration

Check the current state of the codebase and continue from where you left off. If starting fresh, begin with Phase 1. If some phases are complete, continue with the next incomplete phase.

Run verification commands to assess current state before making changes.
