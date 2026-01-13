# Tribes V2 Handover Document

> **Implementation Date**: January 12, 2026
> **Status**: Core implementation complete, integration pending

---

## Overview

Tribes V2 transforms the basic tribes feature into an "underground social layer" - private membership groups that are always present but only visible when you belong. Tribes are accessed via profile dropdown, not a discovery page.

### Access Types

| Type | Description | Join Method |
|------|-------------|-------------|
| **Public** | Anyone can join | Click "Join" button |
| **Request** | Must apply, admin approves | Click "Request to Join", wait for approval |
| **Invite Only** | Need invite code | `/tribes/join/[CODE]` or share link |
| **Secret** | Hidden entirely | Only via invite code, 404 for non-members |

### Member Roles

| Role | Permissions |
|------|-------------|
| **Leader** | Full control, can transfer leadership, delete tribe |
| **Admin** | Manage members, approve requests, change settings |
| **Member** | View tribe content, participate in events |

---

## Files Created

### Database
- `supabase/migrations/20260130_001_tribes_v2.sql` - Complete migration with:
  - Enhanced `tribes` table (access_type, invite_code, settings)
  - New `tribe_members` table (replaces tribe_follows)
  - New `tribe_requests` table
  - RLS policies for all tables
  - Helper functions: `is_tribe_member()`, `is_tribe_admin()`, `is_tribe_banned()`, `get_tribe_by_code()`, `regenerate_tribe_invite_code()`

### API Routes (9 files)
```
app/api/tribes/
├── route.ts                    # GET (list), POST (create)
├── [slug]/
│   ├── route.ts               # GET, PUT, DELETE tribe
│   ├── membership/route.ts    # POST (join), DELETE (leave)
│   ├── members/route.ts       # GET, PUT, DELETE members
│   ├── requests/route.ts      # GET, PUT (approve/reject)
│   └── invite-code/route.ts   # POST (regenerate)
├── join/[code]/route.ts       # GET tribe by invite code
└── me/
    ├── route.ts               # GET user's tribes + pending
    └── requests/[requestId]/route.ts  # DELETE (cancel request)
```

### Pages (3 files)
```
app/[locale]/tribes/
├── [slug]/page.tsx           # Tribe detail page
├── new/page.tsx              # Create tribe form
└── join/[code]/page.tsx      # Join by invite code landing
```

### Components (11 files)
```
components/tribes/
├── tribe-header.tsx           # Hero section with actions
├── tribe-form.tsx             # Create tribe form
├── join-tribe-button.tsx      # Smart join/request/pending button
├── tribe-settings-modal.tsx   # Admin settings (access, code, delete)
├── tribe-requests-modal.tsx   # Approve/reject join requests
├── delete-tribe-modal.tsx     # Confirmation for deletion
├── tribe-members-list.tsx     # Member grid with admin actions
├── transfer-leadership-modal.tsx  # Transfer leadership
├── tribe-events-list.tsx      # Events list for tribe
├── join-by-code-form.tsx      # Invite code landing card
└── my-tribes-dropdown.tsx     # Profile menu section
```

### UI Components Added
```
components/ui/
├── textarea.tsx       # shadcn/ui textarea
├── radio-group.tsx    # Radix radio group
├── switch.tsx         # Radix switch
└── avatar.tsx         # Radix avatar
```

### Types
Added to `lib/types/index.ts`:
- `TribeAccessType`, `TribeMemberRole`, `TribeMemberStatus`, `TribeRequestStatus`, `TribeEventVisibility`
- `Tribe`, `TribeMember`, `TribeRequest` interfaces
- Added `tribe_visibility` to Event interface

### Notifications
Added to `lib/novu.ts`:
- `notifyTribeJoinRequest()` - Notify admins of new request
- `notifyTribeRequestApproved()` - Notify user of approval
- `notifyTribeRequestRejected()` - Notify user of rejection
- `notifyTribeNewEvent()` - Notify members of tribe event

### i18n
Added `tribes` section to all locale files:
- `messages/en.json` (55 keys)
- `messages/fr.json` (French translations)
- `messages/vi.json` (Vietnamese translations)

---

## What's Still Needed

### 1. Profile Menu Integration
Add `MyTribesDropdown` to the user menu in `components/layout/user-menu.tsx` (or equivalent):

```tsx
import { MyTribesDropdown } from "@/components/tribes/my-tribes-dropdown";

// Inside the dropdown menu:
<MyTribesDropdown locale={locale} />
```

### 2. Novu Workflows
Create these workflows in the Novu dashboard:

| Workflow ID | Triggers | Channels |
|-------------|----------|----------|
| `tribe-join-request` | New join request | Push + In-app |
| `tribe-request-approved` | Request approved | Push + In-app |
| `tribe-request-rejected` | Request rejected | In-app only |
| `tribe-new-event` | New tribe event | Push + In-app |

### 3. Event Form Integration (Optional)
Update `components/events/event-form.tsx` to:
- Add tribe selector dropdown for organizers who are tribe admins
- Set `tribe_visibility` when creating tribe events

---

## Testing Guide

### Create Tribe Flow
1. Go to `/en/tribes/new` (must be logged in)
2. Fill in name, description
3. Select access type
4. Submit → redirects to tribe page
5. Verify you're the leader

### Join Flows by Access Type

**Public:**
1. Visit `/en/tribes/[slug]`
2. Click "Join Tribe"
3. Instant membership

**Request:**
1. Visit `/en/tribes/[slug]`
2. Click "Request to Join"
3. Button changes to "Request Pending"
4. As admin: see badge, open requests modal, approve/reject
5. User gets notified

**Invite Only:**
1. As admin: copy invite code from settings
2. Share link: `/en/tribes/join/[CODE]`
3. Non-member visits link → sees join card
4. Click join → instant membership

**Secret:**
1. Direct URL `/en/tribes/[slug]` → 404 for non-members
2. Only accessible via `/en/tribes/join/[CODE]`

### Admin Features
- **Settings gear** → Change access type, regenerate code, delete tribe
- **Requests badge** → Approve/reject (request type only)
- **Member dropdown** → Promote, demote, ban, remove
- **Transfer Leadership** → Select new leader

### Edge Cases to Test
- [ ] Banned user tries to join → shows banned state
- [ ] Banned user tries invite code → fails with error
- [ ] Leader tries to leave → must transfer first
- [ ] Only leader tries to delete → works
- [ ] Non-leader tries to delete → forbidden
- [ ] Expired invite code → fails gracefully

---

## API Reference

### Create Tribe
```bash
POST /api/tribes
{
  "name": "My Tribe",
  "description": "Optional description",
  "access_type": "public" | "request" | "invite_only" | "secret"
}
```

### Get My Tribes
```bash
GET /api/tribes/me
# Returns: { tribes: [...], pending_requests: [...] }
```

### Join Tribe
```bash
POST /api/tribes/[slug]/membership
{
  "invite_code": "ABC123",  // Optional, required for invite_only/secret
  "message": "Please let me join"  // Optional, for request type
}
```

### Leave Tribe
```bash
DELETE /api/tribes/[slug]/membership
```

### Get Tribe by Invite Code
```bash
GET /api/tribes/join/[code]
# Returns: { tribe: { slug, name, description, cover_image_url, access_type } }
```

### Approve/Reject Request
```bash
PUT /api/tribes/[slug]/requests
{
  "request_id": "uuid",
  "action": "approve" | "reject"
}
```

### Change Member Role
```bash
PUT /api/tribes/[slug]/members
{
  "user_id": "uuid",
  "role": "member" | "admin" | "leader"
}
```

### Ban Member
```bash
PUT /api/tribes/[slug]/members
{
  "user_id": "uuid",
  "status": "banned"
}
```

### Regenerate Invite Code
```bash
POST /api/tribes/[slug]/invite-code
# Returns: { invite_code: "NEW123" }
```

---

## Database Schema

### tribes (enhanced)
```sql
access_type TEXT DEFAULT 'public'  -- public, request, invite_only, secret
invite_code TEXT UNIQUE            -- Auto-generated for private types
invite_code_expires_at TIMESTAMPTZ -- Optional expiration
is_listed BOOLEAN DEFAULT true     -- Hidden for secret type
settings JSONB DEFAULT '{}'        -- Future extensibility
```

### tribe_members (new)
```sql
id UUID PRIMARY KEY
tribe_id UUID REFERENCES tribes(id)
user_id UUID REFERENCES profiles(id)
role TEXT DEFAULT 'member'  -- member, admin, leader
status TEXT DEFAULT 'active'  -- active, banned
invited_by UUID
joined_at TIMESTAMPTZ
show_on_profile BOOLEAN DEFAULT true
UNIQUE(tribe_id, user_id)
```

### tribe_requests (new)
```sql
id UUID PRIMARY KEY
tribe_id UUID REFERENCES tribes(id)
user_id UUID REFERENCES profiles(id)
message TEXT
status TEXT DEFAULT 'pending'  -- pending, approved, rejected, cancelled
reviewed_by UUID
created_at TIMESTAMPTZ
reviewed_at TIMESTAMPTZ
UNIQUE(tribe_id, user_id)
```

### Helper Functions
```sql
is_tribe_member(tribe_id, user_id) → BOOLEAN
is_tribe_admin(tribe_id, user_id) → BOOLEAN
is_tribe_banned(tribe_id, user_id) → BOOLEAN
get_tribe_by_code(code) → SETOF tribes
regenerate_tribe_invite_code(tribe_id) → TEXT
```

---

## Known Limitations

1. **No discovery page** - By design, tribes are underground. Found via invite or word of mouth.
2. **No tribe search** - Not implemented, aligns with underground philosophy.
3. **Event-tribe linking** - Events can be linked to tribes but the event form selector isn't implemented yet.
4. **Invite code expiration** - Field exists but no UI to set expiration date.

---

## Commits

1. `c49cc4d` - feat: add Tribes V2 enhanced membership system (29 files)
2. `9647ed0` - fix: add missing UI components for tribes (6 files)

---

## Related Files for Future Reference

- Master plan: `.claude/plans/tribes-v2-master-plan.md`
- Session plan: `~/.claude/plans/wise-jumping-haven.md`
- Mobile guidelines: `CLAUDE.md` (44px touch targets, back button pattern)
