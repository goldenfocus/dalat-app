# Admin Dashboard & Festival System - Handover Document

## Overview

This document covers the admin dashboard, user roles system, festival hub, and verification workflow implemented for dalat.app.

---

## 1. User Roles System

### Role Hierarchy (highest to lowest)

| Role | Level | Access |
|------|-------|--------|
| `admin` | 100 | Full access to everything |
| `moderator` | 80 | Can moderate content, view all data |
| `organizer_verified` | 60 | Can create organizers and festivals |
| `organizer_pending` | 50 | Submitted verification, awaiting approval |
| `contributor` | 40 | Can use AI extraction |
| `user` | 10 | Basic access |

### Key Files

- **Types**: `lib/types/index.ts` - `UserRole`, `ROLE_HIERARCHY`, `hasRoleLevel()`
- **Migration**: `supabase/migrations/20260113_001_extended_roles.sql`

### Usage Example

```typescript
import { hasRoleLevel } from "@/lib/types";

// Check if user can moderate
if (hasRoleLevel(profile.role, "moderator")) {
  // Allow moderation actions
}
```

---

## 2. Admin Dashboard

### URL: `/admin`

### Features

- **Stat Cards**: Total users, published events, RSVPs, push notification adoption
- **Charts** (Recharts):
  - User growth (30-day area chart)
  - Role distribution (donut chart)
  - Event activity (bar chart)
  - RSVP trends (stacked area chart)
- **Verification Queue Alert**: Shows pending verification requests
- **Quick Actions**: Links to common admin tasks

### Key Files

| File | Purpose |
|------|---------|
| `app/[locale]/admin/page.tsx` | Dashboard page |
| `app/[locale]/admin/layout.tsx` | Admin layout with nav |
| `lib/admin/analytics.ts` | Data fetching functions |
| `components/admin/analytics/` | Chart components |

### Analytics RPC Functions

These PostgreSQL functions power the dashboard (defined in `20260116_001_analytics_functions.sql`):

- `get_dashboard_overview()` - Summary stats
- `get_user_growth(days_back)` - User registrations over time
- `get_role_distribution()` - Role breakdown
- `get_event_activity(days_back)` - Event creation stats
- `get_rsvp_trends(days_back)` - RSVP status trends
- `get_verification_queue_stats()` - Verification counts
- `get_extraction_stats()` - AI extraction metrics
- `get_festival_stats()` - Festival counts

---

## 3. User Management

### URL: `/admin/users`

### Features

- Search users by username or display name
- View all users with role badges
- **Change roles instantly** via dropdown
- Stats showing role distribution

### Key Files

- `app/[locale]/admin/users/page.tsx`
- `components/admin/user-management-table.tsx`

---

## 4. Verification Workflow

### User Flow

1. User goes to `/settings/verification`
2. Fills out verification form (org name, type, proof links)
3. Submits → role becomes `organizer_pending`
4. Admin reviews at `/admin/verifications`
5. Admin approves → role becomes `organizer_verified`

### Verification Statuses

- `pending` - Awaiting review
- `approved` - Verified, user upgraded to organizer_verified
- `rejected` - Denied with reason
- `more_info_needed` - Admin requested additional info

### Key Files

| File | Purpose |
|------|---------|
| `app/[locale]/settings/verification/page.tsx` | User request page |
| `app/[locale]/admin/verifications/page.tsx` | Admin review queue |
| `components/settings/verification-request-form.tsx` | Request form |
| `components/admin/verification-request-card.tsx` | Admin review card |

### Database

- **Table**: `verification_requests`
- **RPC**: `approve_verification_request(request_id, admin_notes, organizer_slug)`
- **RPC**: `reject_verification_request(request_id, rejection_reason)`
- **Migration**: `20260114_001_verification_requests.sql`

---

## 5. Festival Hub

### Public Pages

- `/festivals` - List of all festivals
- `/festivals/[slug]` - Individual festival page with tabs

### Admin Pages

- `/admin/festivals` - Festival management
- `/admin/festivals/new` - Create new festival

### Festival Page Tabs

1. **Program** - Official events + community side events
2. **Updates** - Announcements and news
3. **About** - Festival description

### Database Schema

```
festivals
├── festival_organizers (many-to-many with organizers)
├── festival_events (many-to-many with events)
└── festival_updates (announcements)
```

### Key Files

| File | Purpose |
|------|---------|
| `app/[locale]/festivals/page.tsx` | Festival listing |
| `app/[locale]/festivals/[slug]/page.tsx` | Festival hub page |
| `components/festivals/festival-tabs.tsx` | Program/Updates/About tabs |
| `components/admin/festival-form.tsx` | Create/edit form |

### Migration

- `20260115_001_festivals.sql`

---

## 6. Database Migrations

All migrations are in `supabase/migrations/`:

| File | Content |
|------|---------|
| `20260113_001_extended_roles.sql` | Role constraint update, `get_role_level()`, `has_role_level()` |
| `20260114_001_verification_requests.sql` | Verification table, RLS, approval RPCs |
| `20260115_001_festivals.sql` | Festival tables (festivals, festival_organizers, festival_events, festival_updates) |
| `20260116_001_analytics_functions.sql` | 12 RPC functions for dashboard |
| `20260117_001_set_yan_admin.sql` | Set user 'yan' as admin |

### Applying Migrations

```bash
npx supabase db push
```

---

## 7. Admin Navigation

The admin nav shows different items based on role:

| Item | Visible to |
|------|------------|
| Dashboard | All admin users |
| Organizers | Moderators+ |
| Festivals | Organizers+ |
| AI Extract | All admin users |
| Verifications | Admins only |
| Users | Admins only |

---

## 8. User Menu

The user menu (dropdown from avatar) now contains:

- Profile link (click avatar/name)
- Edit Profile
- Settings
- **Admin** (only for privileged users)

Theme, language, and sign-out are in `/settings`.

---

## 9. Settings Page

URL: `/settings`

Contains:
- Notifications toggle
- Theme selector (Light/Dark/System)
- Language selector (EN/VI/FR)
- Sign out button

---

## 10. Tech Stack

- **Charts**: Recharts
- **Database**: Supabase PostgreSQL with RLS
- **Framework**: Next.js 16 App Router with `[locale]` folder structure
- **i18n**: next-intl
- **UI**: shadcn/ui + Tailwind CSS

---

## 11. Known Issues / TODOs

1. **500 Error on `/admin`**: If this persists after deployment, check that all RPC functions exist in Supabase. The analytics functions return empty data gracefully, but if they don't exist at all it may error.

2. **Linter Aggressiveness**: The ESLint/Biome setup aggressively removes "unused" imports. When editing `user-menu.tsx` or similar files, the linter may strip functionality.

3. **Festival Creation**: The festival form is basic - no image upload yet.

4. **Verification Form**: Could add file upload for proof documents.

---

## 12. Testing Checklist

- [ ] Visit `/admin` - should show dashboard with charts
- [ ] Visit `/admin/users` - should list all users with role dropdowns
- [ ] Change a user's role - should update immediately
- [ ] Visit `/settings/verification` - should show request form
- [ ] Submit verification request - should change user role to `organizer_pending`
- [ ] Visit `/admin/verifications` - should show pending requests
- [ ] Approve/reject verification - should update user role
- [ ] Visit `/festivals` - should list festivals
- [ ] Create a festival at `/admin/festivals/new`

---

## 13. Quick Reference

### Setting a user as admin (SQL)

```sql
UPDATE profiles SET role = 'admin' WHERE username = 'username';
```

### Check role level in code

```typescript
import { hasRoleLevel } from "@/lib/types";

// Returns true if user is moderator or higher
hasRoleLevel(user.role, "moderator")
```

### Admin access roles

```typescript
const ADMIN_ROLES = ["admin", "moderator", "organizer_verified", "contributor"];
```

---

## 14. Contact

For questions about this implementation, refer to the conversation history or contact the development team.
