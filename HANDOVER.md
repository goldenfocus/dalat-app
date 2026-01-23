# Project Handover Document

## Context

**Project**: dalat.app - A community events platform for Dalat, Vietnam
**Date**: January 23, 2026
**Last Updated By**: Claude Opus 4.5 with code-reviewer and Explore agents

---

# Interactive Event Map (NEW - Priority)

## Branch & Status

**Branch**: `main`
**Commits**:
- `f1b138c` - fix: resolve calendar hydration mismatch and URL sync infinite loop
- (Earlier) fix: resolve Google Maps initialization race condition
- (Earlier) feat: disperse stacked map markers and add geocoding backfill
- (Earlier) feat: add date range filter to map (default 7 days)
- (Earlier) feat: AI-powered location estimation for map markers

## The Vision

An interactive map showing upcoming and happening events in Dalat, with:
- **Smart markers** that don't stack on top of each other
- **AI-powered geocoding** that estimates venue locations from names
- **Date filtering** to focus on relevant timeframes
- **Mobile-first** design with collapsible filters

## What Was Built

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MAP PAGE                                  │
│  /[locale]/map                                              │
│  - Server component fetches events via Supabase RPC         │
│  - Passes to EventMap client component                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    EVENT MAP                                 │
│  components/map/event-map.tsx                               │
│  - Google Maps with Advanced Markers                        │
│  - Date range filtering (7/14/30 days or all)               │
│  - Marker dispersion for stacked events                     │
│  - Mobile: collapsed "Filters" button                       │
│  - Desktop: always-visible filter bar                       │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               GEOCODING API (Admin)                          │
│  app/api/admin/geocode-events/route.ts                      │
│  - Google Geocoding API (primary)                           │
│  - Claude AI estimation (fallback)                          │
│  - 10 Dalat neighborhood areas defined                      │
│  - Realistic scatter within estimated area                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

```
app/[locale]/map/
└── page.tsx                    # Server component, fetches events

components/map/
└── event-map.tsx               # Main map component (client)

app/api/admin/geocode-events/
└── route.ts                    # AI-powered geocoding backfill

components/places/
└── PlaceAutocomplete.tsx       # Google Places for event creation
```

### Core Implementation Details

#### 1. Google Maps Initialization (Race Condition Fix)

The Google Maps API loads progressively. We can't just check `google.maps` exists:

```typescript
// ❌ WRONG - google.maps exists before classes are ready
if (google.maps) { ... }

// ✅ CORRECT - check if Map constructor is actually available
const isGoogleMapsReady = () => {
  return (
    typeof google !== "undefined" &&
    google.maps &&
    typeof google.maps.Map === "function"
  );
};
```

Also: `mapId` and `styles` are **mutually exclusive**. Using both causes a console error. We use `mapId` for Cloud Console styling.

#### 2. Marker Dispersion (Spiral Offset)

Events at the same venue get offset in a spiral pattern:

```typescript
const getOffset = (index: number, total: number): { lat: number; lng: number } => {
  if (total <= 1) return { lat: 0, lng: 0 };
  const angle = (index / total) * 2 * Math.PI;
  const radius = 0.0004 + (index * 0.0001); // ~40-80m offset
  return {
    lat: Math.sin(angle) * radius,
    lng: Math.cos(angle) * radius,
  };
};
```

Events are grouped by `locationKey = lat.toFixed(4) + "," + lng.toFixed(4)`.

#### 3. AI-Powered Geocoding

When Google Geocoding returns generic "Đà Lạt" results, Claude estimates the neighborhood:

```typescript
const DALAT_AREAS = {
  center: { lat: 11.9404, lng: 108.4583, radius: 0.008 },    // City center
  market: { lat: 11.9428, lng: 108.4381, radius: 0.005 },    // Night market
  square: { lat: 11.9365, lng: 108.4428, radius: 0.004 },    // Lâm Viên Square
  university: { lat: 11.9550, lng: 108.4420, radius: 0.006 }, // University
  trainStation: { lat: 11.9340, lng: 108.4550, radius: 0.004 }, // Old train station
  hoabinh: { lat: 11.9380, lng: 108.4320, radius: 0.005 },   // Hòa Bình area
  xuanhuong: { lat: 11.9420, lng: 108.4480, radius: 0.006 }, // Xuân Hương lake
  camly: { lat: 11.9280, lng: 108.4380, radius: 0.005 },     // Cam Ly waterfall
  tuyen_lam: { lat: 11.8950, lng: 108.4350, radius: 0.015 }, // Tuyền Lâm lake
  langbiang: { lat: 12.0450, lng: 108.4380, radius: 0.020 }, // Lang Biang mountain
};
```

Confidence levels (`high`/`medium`/`low`) affect how much scatter is added.

#### 4. Date Range Filtering

```typescript
const DATE_PRESETS = [
  { value: "7d", label: "Next 7 days", days: 7 },
  { value: "14d", label: "Next 14 days", days: 14 },
  { value: "30d", label: "Next 30 days", days: 30 },
  { value: "all", label: "All upcoming", days: null },
];
```

- Default: 7 days (per user request to reduce cognitive load)
- Mobile: Collapsed behind "Filters" button
- Desktop: Always visible bar

---

## Pending Tasks

### 1. Run Geocoding Backfill on Production

Open browser console on production (logged in as admin):

```javascript
fetch('/api/admin/geocode-events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // ← IMPORTANT!
  body: JSON.stringify({ limit: 50, reprocess: true })
}).then(r => r.json()).then(console.log)
```

Options:
- `limit`: Number of events to process (default 10)
- `reprocess: true`: Re-geocode events that already have coordinates
- `dryRun: true`: Preview without saving

### 2. Remove Debug Logging

In [map/page.tsx](app/[locale]/map/page.tsx), remove lines 54-64:

```typescript
// DELETE THESE LINES
console.log(`[Map] Total events: ${allEvents.length}`);
console.log(`[Map] Events with coordinates: ${allEvents.filter(e => e.latitude && e.longitude).length}`);
if (allEvents.length > 0) {
  console.log(`[Map] Sample event:`, {
    title: allEvents[0].title,
    location_name: allEvents[0].location_name,
    latitude: allEvents[0].latitude,
    longitude: allEvents[0].longitude,
  });
}
```

---

## Known Issues

| Issue | Impact | Fix Priority |
|-------|--------|--------------|
| Debug logging in map page | Console clutter | Low (remove before next release) |
| No custom date picker | Can't select specific dates | Medium |
| Marker popups overlap on zoom out | Visual clutter | Low |

---

## Next Level Improvements

### Phase 1: Enhanced UX
- [ ] Custom date picker for specific date range
- [ ] Map/List split view toggle
- [ ] "Happening Now" mode with pulsing markers
- [ ] Smart clustering at low zoom levels

### Phase 2: Discovery Features
- [ ] Filter by event tags/categories
- [ ] Search within map bounds
- [ ] Save favorite locations
- [ ] "Events near me" with geolocation

### Phase 3: Real-time
- [ ] Live attendance counts on markers
- [ ] Real-time updates when events start
- [ ] Integration with live streaming feature

---

## Instructions for Next AI

### Recommended Approach

1. **Use `/feature-dev` skill** for major enhancements
2. **Use Task tool with `subagent_type=Plan`** before architectural changes
3. **Use code review agents** after modifications

### Key Technical Context

- Map uses Google Maps JavaScript API with `@vis.gl/react-google-maps`
- Advanced Markers require `mapId` (set in Google Cloud Console)
- Events come from `get_events_by_lifecycle` RPC function
- Coordinates stored as `latitude`/`longitude` on events table

### Quick Commands

```bash
# Check events without coordinates
SELECT COUNT(*) FROM events WHERE latitude IS NULL AND location_name IS NOT NULL;

# View geocoding results
SELECT title, location_name, latitude, longitude
FROM events
WHERE latitude IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;
```

---

# Live Streaming Feature (Priority)

## ⚠️ CURRENT ISSUE: "Streaming service not configured" on Production

**Status**: Environment variables exist in `.env.local` AND supposedly in Vercel, but production returns 503.

### Debugging Steps Needed

1. **Verify Vercel env vars are set for Production** (not just Preview):
   - Go to Vercel Dashboard → dalat-app → Settings → Environment Variables
   - Ensure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN` have **Production** checkbox enabled
   - If recently added, **trigger a new deployment** (env vars don't auto-deploy)

2. **Add diagnostic logging** to identify missing vars (see Code Issues below)

3. **Check API route runtime** - ensure it's not accidentally running on Edge Runtime

### Code Issues Found (Should Fix)

| Issue | File | Line | Priority |
|-------|------|------|----------|
| No logging for which env var is missing | `app/api/streaming/streams/route.ts` | 13-14 | **High** |
| CommonJS `require('crypto')` in ES module | `lib/cloudflare-stream.ts` | 250 | **High** |
| Webhook verification bypasses in dev (dangerous if deployed without secret) | `lib/cloudflare-stream.ts` | 220-223 | Medium |
| HLS.js import error not logged | `components/streaming/viewer/StreamPlayer.tsx` | 79-84 | Low |

---

## Branch & Status

**Branch**: `main` (merged)
**Last Commits**:
- `8722eaa`: Quick "Go Live" button
- `de304c1`: Streaming fixes + MOV upload support
- `45ab4a1`: HLS.js dependency + TypeScript fixes
- `5df75bc`: Initial live streaming MVP

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROADCASTER                               │
│  /events/[slug]/live/broadcast                              │
│  - Camera preview (getUserMedia with H.264/AAC)             │
│  - Creates stream → gets RTMPS credentials                  │
│  - Copy buttons for OBS/Streamlabs setup                    │
│  - Real-time status: IDLE → CONNECTING → LIVE → ENDED       │
└─────────────────────┬───────────────────────────────────────┘
                      │ RTMPS (rtmps://live.cloudflare.com:443/live/)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               CLOUDFLARE STREAM                              │
│  - Ingests RTMPS, transcodes to WebRTC (WHEP) + HLS         │
│  - Automatic recording with 30s timeout                     │
│  - Webhooks: live_input.connected/disconnected, video.ready │
│  - ~$15/event vs $660 with Mux (97% cheaper!)               │
└─────────────────────┬───────────────────────────────────────┘
                      │ WHEP/HLS playback
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      VIEWER                                  │
│  /events/[slug]/live                                        │
│  - StreamPlayer (hls.js low-latency + Safari native HLS)    │
│  - StreamChat (Supabase Realtime subscriptions)             │
│  - Real-time viewer count + LIVE badge                      │
│  - "Tap for sound" unmute prompt                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `live_streams` table
```sql
- id (uuid, PK)
- event_id (FK → events)
- broadcaster_id (FK → profiles)
- cf_live_input_id (Cloudflare live input UID)
- cf_stream_key (RTMPS stream key - SECRET)
- cf_playback_url (WHEP/HLS playback URL - public)
- title, angle_label ("Main", "Crowd", etc.)
- status: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended'
- current_viewers, peak_viewers
- started_at, ended_at
- UNIQUE constraint: (event_id, broadcaster_id)
```

### `stream_chat_messages` table
```sql
- id (uuid, PK)
- event_id (FK → events)
- user_id (FK → profiles)
- content (text, 1-500 chars)
- message_type: 'text' | 'system' | 'highlight'
- is_deleted, deleted_by, deleted_at (soft delete for moderation)
```

### RPC Functions (6 total)
1. `create_live_stream(event_id, title, angle_label)`
2. `update_stream_status(stream_id, status, current_viewers)`
3. `get_event_streams(event_id)` - with broadcaster info
4. `send_stream_chat_message(event_id, content)`
5. `delete_stream_chat_message(message_id)`
6. `get_stream_chat_messages(event_id, limit, before)` - paginated

### RLS Policies
- Public can view streams for published events
- Only event creator can create streams
- Auth users can chat; creator can moderate (delete)
- Realtime enabled on both tables

---

## API Endpoints

### Stream Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/streaming/streams` | POST | Create new stream for event |
| `/api/streaming/streams` | GET | List active streams (`?eventId=`) |
| `/api/streaming/streams/[streamId]` | GET | Get stream + ingest credentials (broadcaster only) |
| `/api/streaming/streams/[streamId]` | PATCH | Update title/angle_label |
| `/api/streaming/streams/[streamId]` | DELETE | Delete stream + Cloudflare input |
| `/api/streaming/streams/[streamId]/status` | PATCH | Update status & viewer count |

### Quick Live
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/streaming/quick-live` | POST | Create minimal event + stream in one call |

### Chat
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/streaming/chat` | POST | Send message |
| `/api/streaming/chat` | GET | Fetch history (`?eventId=&limit=&before=`) |
| `/api/streaming/chat` | DELETE | Delete message (`?messageId=`) |

### Webhooks
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/streaming/webhooks/cloudflare` | POST | Handle Cloudflare lifecycle events |

---

## Key Files

```
app/[locale]/events/[slug]/live/
├── page.tsx                      # Viewer (public, event must be published)
└── broadcast/
    └── page.tsx                  # Broadcaster (event creator only)

components/streaming/
├── broadcaster-interface.tsx     # Camera preview + RTMPS credentials
├── viewer-interface.tsx          # Player + chat layout
├── StreamStatusBadge.tsx         # "🔴 LIVE" badge with viewer count
├── WatchLiveButton.tsx           # Entry point with context-aware text
├── GoLiveModal.tsx               # Quick "Go Live" dialog
├── viewer/
│   └── StreamPlayer.tsx          # HLS.js player with controls
└── chat/
    ├── StreamChat.tsx            # Chat container with Realtime
    ├── ChatMessage.tsx           # Message with delete button
    └── ChatInput.tsx             # 500-char input with Enter to send

lib/
├── cloudflare-stream.ts          # API client (285 lines)
└── hooks/
    ├── use-stream-status.ts      # Realtime stream subscription
    └── use-chat-subscription.ts  # Realtime chat subscription

app/api/streaming/
├── streams/route.ts              # Create/list streams
├── streams/[streamId]/route.ts   # CRUD single stream
├── streams/[streamId]/status/route.ts
├── quick-live/route.ts           # One-tap event+stream creation
├── chat/route.ts
└── webhooks/cloudflare/route.ts  # HMAC-verified webhook handler

supabase/migrations/
└── 20260325_001_live_streaming.sql  # Full schema (532 lines)
```

---

## Environment Variables

```env
# Required for streaming
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_STREAM_API_TOKEN=your-api-token

# Optional (for production webhook security)
CLOUDFLARE_STREAM_WEBHOOK_SECRET=your-webhook-secret
```

**How to get:**
1. Cloudflare Dashboard → Stream
2. Account ID is in the URL sidebar
3. API Tokens → Create with "Cloudflare Stream: Edit" permission
4. For webhook secret: Cloudflare Dashboard → Stream → Webhooks → Configure

---

## Features Implemented ✅

- [x] Cloudflare Stream integration (RTMPS ingest + WHEP/HLS playback)
- [x] Live stream creation with broadcaster credentials
- [x] Quick "Go Live" (single-tap event + stream creation)
- [x] Stream lifecycle: idle → connecting → live → reconnecting → ended
- [x] Real-time viewer count tracking
- [x] Broadcast interface with camera preview
- [x] Stream playback with HLS.js + Safari native fallback
- [x] Real-time chat with Supabase Realtime
- [x] Chat moderation (event creator can delete)
- [x] Soft-delete for chat audit trail
- [x] Cloudflare webhook handling (lifecycle events)
- [x] HMAC-SHA256 webhook signature verification
- [x] Multiple angle labels per event
- [x] Responsive mobile-first UI
- [x] Error handling + retry in player
- [x] Automatic recording (Cloudflare mode: automatic)

---

## Not Implemented Yet ❌

### Missing (Should Add)
- [ ] VOD playback - `video.ready` webhook is handled but video UID not stored
- [ ] Stream cleanup on tab close - broadcaster can leave tab while "live"
- [ ] Rate limiting on stream/chat creation
- [ ] Better error messages showing which env var is missing

### Future Phases
**Phase 2: Multi-Angle**
- [ ] Multi-view grid layout (2-6 streams)
- [ ] Stream switching (click to focus)
- [ ] Broadcast permissions for collaborators

**Phase 3: Enhanced UX**
- [ ] Picture-in-picture mode
- [ ] Keyboard shortcuts (1-6 to switch)
- [ ] Viewer analytics dashboard
- [ ] VOD replay UI

**Phase 4: Polish**
- [ ] Stream health monitoring
- [ ] Chat slow mode / moderation queue
- [ ] Polls and reactions
- [ ] Push notification "Event is live!"

---

## Integration Points (Not Done)

| Component | Where | Action |
|-----------|-------|--------|
| "Watch Live" button | Event detail page | Add `<WatchLiveButton>` |
| "Go Live" for creator | Event happening badge | Show when user is creator |
| Live indicator on cards | Event cards | Red dot during streams |
| Push notification | Webhook handler | Trigger on `live_input.connected` |

---

## Testing Checklist

```bash
# 1. Verify environment variables are set
# In Vercel: Settings → Environment Variables → check Production is enabled

# 2. Create a published event that's "happening now"
# (starts_at <= now <= ends_at)

# 3. As event creator, go to /events/[slug]/live/broadcast
# - Should see camera preview
# - Click "Create Stream" → get RTMPS credentials

# 4. Stream using OBS:
# Settings → Stream → Custom
# Server: rtmps://live.cloudflare.com:443/live/
# Stream Key: (from app)
# Start Streaming

# 5. Open /events/[slug]/live in another tab
# - Video should appear after ~5 seconds
# - Chat should work in real-time

# 6. Check Cloudflare Dashboard → Stream for the live input
```

---

## Recommended Fixes (Priority Order)

### 1. Add diagnostic logging for missing env vars
**File**: `lib/cloudflare-stream.ts:45-50`
```typescript
export function isCloudflareStreamConfigured(): boolean {
  const hasAccountId = !!process.env.CLOUDFLARE_ACCOUNT_ID;
  const hasApiToken = !!process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!hasAccountId || !hasApiToken) {
    console.error('[Cloudflare Stream] Missing env vars:', {
      CLOUDFLARE_ACCOUNT_ID: hasAccountId ? '✓' : '✗',
      CLOUDFLARE_STREAM_API_TOKEN: hasApiToken ? '✓' : '✗',
    });
  }

  return hasAccountId && hasApiToken;
}
```

### 2. Fix CommonJS require in ES module
**File**: `lib/cloudflare-stream.ts:250`
```typescript
// Replace: const crypto = require('crypto');
// With import at top of file:
import { createHmac, timingSafeEqual } from 'crypto';
```

### 3. Add production check for webhook secret
**File**: `lib/cloudflare-stream.ts:220-223`
```typescript
if (!webhookSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[Cloudflare] WEBHOOK_SECRET required in production');
    return false;
  }
  console.warn('[Cloudflare] Skipping signature verification (dev only)');
  return true;
}
```

---

## Instructions for Next AI

### Debug the Production Issue
1. Check Vercel Dashboard → Environment Variables → ensure Production is checked
2. If vars are set, add the diagnostic logging (see fix #1 above)
3. Redeploy and check Vercel logs for the error output
4. If still failing, check if API route is accidentally using Edge Runtime

### Key Technical Context
- Cloudflare Stream uses WHIP for ingest, WHEP for playback
- HLS.js loads dynamically (client-side only)
- Supabase Realtime for both chat and stream status
- Webhooks update stream status automatically
- Stream key is only exposed to broadcaster via authenticated API

### Useful Commands
```bash
# Check Vercel env vars via CLI
vercel env ls production

# Pull env vars locally
vercel env pull .env.local

# Force redeploy
vercel --prod
```

---

# Notification System

**Focus Area**: Custom notification system (replaced Novu for full control over channels, scheduling, and localization)

---

## Recent Work Completed

### Fixed Critical Bug - Broken Notification URLs

**Problem**: Clicking notifications led to 404 pages with URLs like:
```
https://dalat.app/en/events/undefined/events/dbw-mid-week-check-in
```

**Root Cause**: When `NEXT_PUBLIC_APP_URL` was undefined (especially in Inngest cron context), template literals converted it to the string `"undefined"`.

**Fix**: In `lib/notifications/templates.ts:40-42`:
```typescript
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://dalat.app';
}
```
All 13 URL constructions now use `getBaseUrl()`.

---

## System Architecture

### Channels

| Channel | Technology | Status |
|---------|------------|--------|
| In-App | Supabase `notifications` table + Realtime | Working |
| Push | `web-push` package with VAPID | Working |
| Email | Resend API | Working |

### Key Files

```
lib/notifications/
├── index.ts           # Main orchestrator, notify() + 14 helper functions
├── types.ts           # All TypeScript types
├── templates.ts       # Localized templates (en/fr/vi) for all notification types
├── preferences.ts     # User preferences + default channels per type
└── channels/
    ├── in-app.ts      # Supabase insert with RLS
    ├── push.ts        # web-push sending + expired subscription cleanup
    └── email.ts       # Resend API + bulk support

lib/inngest/functions/
└── scheduled-notifications.ts  # Cron (every minute) + event handlers

app/api/notifications/
├── rsvp/route.ts      # Triggers RSVP confirmation + schedules reminders
├── cancel/route.ts    # Cancellation + waitlist promotion
└── interested/route.ts # Schedules reminders for "interested" users

app/api/invite/[token]/
└── rsvp/route.ts      # Email invitation RSVPs (HAS organizer notification!)
```

### Scheduled Notifications Flow

```
User RSVPs → POST /api/notifications/rsvp
         → notifyRsvpConfirmation() [immediate]
         → inngest.send({ name: 'rsvp/created' })
         → onRsvpCreated inserts into scheduled_notifications:
             - 24h before: confirm_attendance_24h
             - 2h before: final_reminder_2h
             - 3h after: feedback_request
         → processScheduledNotifications cron (every minute) sends when due

User cancels → POST /api/notifications/cancel
           → inngest.send({ name: 'rsvp/cancelled' })
           → onRsvpCancelled marks scheduled notifications as 'cancelled'
           → If someone promoted: notifyWaitlistPromotion + schedule their reminders
```

---

## All 14 Notification Types - Status

| Type | Description | Trigger Location | Status |
|------|-------------|------------------|--------|
| `rsvp_confirmation` | "You're going to Event!" | `POST /api/notifications/rsvp` | Working |
| `confirm_attendance_24h` | "Event is tomorrow, still coming?" | Inngest scheduled | Working |
| `final_reminder_2h` | "Event starts in 2h at Location!" | Inngest scheduled | Working |
| `event_reminder` | For "interested" users, 24h before | Inngest scheduled | Working |
| `waitlist_promotion` | "You got a spot!" | `POST /api/notifications/cancel` | Working |
| `waitlist_position` | "You're now #X on waitlist" | **NOT TRIGGERED** | Missing |
| `new_rsvp` | Organizer: "Name is going" | `app/api/invite/[token]/rsvp` only | **Partial** |
| `feedback_request` | "How was Event?" (3h after) | Inngest scheduled | Working |
| `event_invitation` | Email invite to non-user | Invite flow | Working |
| `user_invitation` | In-app invite to existing user | Invite flow | Working |
| `tribe_join_request` | "Name wants to join Tribe" | Tribe request flow | Working |
| `tribe_request_approved` | "Welcome to Tribe!" | Tribe approval | Working |
| `tribe_request_rejected` | "Request not approved" | Tribe rejection | Working |
| `tribe_new_event` | "New event in Tribe" | Event creation | Working |

---

## Database Schema

### notifications (in-app)

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | uuid | Recipient |
| `type` | notification_type | One of 14 types |
| `title`, `body` | text | Display content |
| `primary_action_url` | text | Click destination |
| `read` | boolean | Read state |
| `metadata` | jsonb | Extra data |

Real-time enabled via Supabase Realtime.

### scheduled_notifications (for Inngest)

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | uuid | Recipient |
| `type` | notification_type | Notification type |
| `scheduled_for` | timestamptz | When to send |
| `payload` | jsonb | Full notification data |
| `status` | text | `pending` → `processing` → `sent`/`failed`/`cancelled` |
| `reference_type` | text | `'event_rsvp'` or `'event_interested'` |
| `reference_id` | uuid | `${eventId}-${userId}` for cancellation lookup |

**Status State Machine**:
```
pending → processing → sent
                    → failed (with error_message)
pending → cancelled (when user cancels RSVP)
```

### push_subscriptions

Multiple per user (one per device/browser). Uses `endpoint`, `p256dh`, `auth` for web-push.

### notification_preferences

| Column | Type | Notes |
|--------|------|-------|
| `channel_preferences` | jsonb | Per-type channel overrides |
| `quiet_hours_enabled` | boolean | Enable quiet hours |
| `quiet_hours_start/end` | time | Quiet period |
| `email_digest` | boolean | **EXISTS BUT NOT IMPLEMENTED** |

---

## Gotchas & Lessons Learned

### 1. URL Construction Bug (FIXED)
Never use `${process.env.NEXT_PUBLIC_APP_URL}` directly. Always use `getBaseUrl()` in `templates.ts` which falls back to `'https://dalat.app'`.

### 2. Service Role Required
All notification operations use `createServiceClient()`. If `SUPABASE_SERVICE_ROLE_KEY` is missing or invalid, notifications **silently fail**. Use `/api/notifications/debug` to diagnose.

### 3. Timezone Hardcoded
`Asia/Ho_Chi_Minh` is hardcoded in:
- `lib/inngest/functions/scheduled-notifications.ts:164`
- `lib/notifications/templates.ts:369`

### 4. Quiet Hours Only Affect Push
When quiet hours are active, only push notifications are suppressed. In-app and email still send.

### 5. No Retry Logic
Failed scheduled notifications are marked `status='failed'` but never retried. They accumulate indefinitely.

### 6. Push Tag Deduplication
Notifications with the same `tag` replace each other in the browser. Example: `"rsvp-${eventSlug}"` - if user RSVPs, cancels, RSVPs again quickly, they might only see one notification.

### 7. Unused email_digest Column
`notification_preferences.email_digest` exists but is not implemented. Don't assume it works.

### 8. Localization
Only `en`, `fr`, `vi` are supported. Unknown locales fall back to English (`templates.ts:30-34`).

---

## What's Missing - Implementation Guide

### A. `waitlist_position` - Notify when position changes

**When**: Another waitlisted user cancels, bumping everyone up
**Template**: Ready in `templates.ts:291-312`
**Helper**: `notifyWaitlistPositionUpdate()` in `index.ts:328-345`

**Add to** `app/api/notifications/cancel/route.ts` after waitlist promotion (~line 80):

```typescript
// Notify remaining waitlisted users of their new position
const { data: waitlistedUsers } = await supabase
  .from('rsvps')
  .select('user_id, profiles(locale)')
  .eq('event_id', eventId)
  .eq('status', 'waitlist')
  .order('created_at', { ascending: true });

if (waitlistedUsers?.length) {
  await Promise.all(
    waitlistedUsers.map((user, index) =>
      notifyWaitlistPositionUpdate(
        user.user_id,
        user.profiles?.locale || 'en',
        eventTitle,
        index + 1,  // New position (1-indexed)
        eventSlug
      )
    )
  );
}
```

### B. `new_rsvp` - Notify organizer of new attendees

**Status**: Partially working - triggers for email invites in `app/api/invite/[token]/rsvp/route.ts:114-132`
**Missing in**: Main RSVP flow at `app/api/notifications/rsvp/route.ts`
**Template**: Ready
**Helper**: `notifyOrganizerNewRsvp()` in `index.ts:347-364`

**Add to** `app/api/notifications/rsvp/route.ts` after `notifyRsvpConfirmation()` call (~line 65):

```typescript
// Notify organizer (if not self-RSVP and status is 'going')
if (rsvpStatus === 'going') {
  const { data: event } = await supabase
    .from('events')
    .select('created_by, title, slug')
    .eq('id', eventId)
    .single();

  if (event && event.created_by !== userId) {
    const { data: organizerProfile } = await supabase
      .from('profiles')
      .select('locale')
      .eq('id', event.created_by)
      .single();

    await notifyOrganizerNewRsvp(
      event.created_by,
      organizerProfile?.locale || 'en',
      event.title,
      profile?.display_name || 'Someone',
      event.slug
    );
  }
}
```

**Edge cases handled**:
- Don't notify if user is the organizer (self-RSVP)
- Don't notify for waitlist status (only 'going')

---

## Environment Variables Required

| Variable | Purpose | Where to get |
|----------|---------|--------------|
| `NEXT_PUBLIC_APP_URL` | Base URL for notification links | Your domain |
| `VAPID_PUBLIC_KEY` | Web push authentication | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web push authentication | Same as above |
| `RESEND_API_KEY` | Email sending | resend.com dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Database operations | Supabase dashboard |
| `INNGEST_EVENT_KEY` | Event publishing | Inngest dashboard |
| `INNGEST_SIGNING_KEY` | Webhook verification | Inngest dashboard |

---

## Testing & Debugging

### Debug Endpoint
`GET /api/notifications/debug` - Returns:
- Push subscription count for current user
- VAPID key configuration status
- Environment variable checks
- Diagnosis of common issues

### Test Endpoint
`POST /api/test-notification?type=rsvp|24h|2h|waitlist`

Sends a test notification of the specified type.

### Manual Verification Checklist

1. **Check scheduled_notifications table** for pending entries:
   ```sql
   SELECT * FROM scheduled_notifications WHERE status = 'pending';
   ```

2. **Check notifications table** for in-app entries:
   ```sql
   SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
   ```

3. **Check Inngest dashboard** at `/api/inngest` or Inngest Cloud

4. **Check Resend dashboard** for email delivery status

### Testing Locally

```bash
# Start Inngest dev server
npx inngest-cli dev

# In another terminal, start Next.js
npm run dev

# Visit http://localhost:8288 to see Inngest dashboard
```

---

## Recommended Approach for Next AI

1. **Explore** using Task tool with `subagent_type=Explore`
2. **Read** the specific files mentioned in "What's Missing" section
3. **Implement** using the provided code snippets
4. **Test** using the debug and test endpoints
5. **Review** using the code-reviewer agent

### Quick Start Command

```
Read HANDOVER.md and implement the missing notifications (waitlist_position
and new_rsvp). The code snippets and exact file locations are provided.
Test using POST /api/test-notification and verify in the database.
```

---

## Future Improvements (Not Urgent)

- [ ] Notification preferences UI (users can customize channels per type)
- [ ] Implement quiet hours for email/in-app (currently only push)
- [ ] Add retry logic for failed scheduled notifications
- [ ] Implement email_digest for organizers (daily summary instead of per-RSVP)
- [ ] Add test coverage for notification flows
- [ ] Clean up old failed notifications from database
