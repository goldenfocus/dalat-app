# Admin Dashboard Analytics - Handover Document

**Date:** January 11, 2026
**Session Focus:** Fix admin 500 errors, add session/login analytics

---

## Summary of Changes

### 1. Fixed 500 Error on `/admin` (Critical)

**Problem:** The admin dashboard was returning 500 errors in production.

**Root Causes Fixed:**
1. **Server/Client Component boundary violation** - Passing Lucide icon components (functions) from Server Components to Client Components is not allowed in Next.js App Router
2. **Missing error handling** - RPC functions could throw exceptions that weren't caught
3. **Unsafe optional chaining** - `overview?.users.total` throws if `overview` exists but `users` is undefined

**Files Changed:**
- `components/admin/analytics/stat-card.tsx` - Changed `icon: LucideIcon` to `icon: ReactNode`
- `app/[locale]/admin/page.tsx` - Pass rendered JSX icons (`<Users className="..." />`) instead of component functions
- `lib/admin/analytics.ts` - Added try-catch to all 9 analytics functions
- `app/[locale]/admin/layout.tsx` - Added try-catch around auth/profile fetching

### 2. Added Session Stats to Main Dashboard

**New Stats Cards on `/admin`:**
- **Connections** - Total users who have logged in + active today count
- **Last Login** - Most recent login timestamp across all users

**Files:**
- `lib/types/index.ts` - Added optional `sessions` field to `DashboardOverview`
- `lib/admin/analytics.ts` - Added `SessionStats` interface and `getSessionStats()` function
- `supabase/migrations/20260121_001_session_stats.sql` - RPC function `get_session_stats()`

### 3. Added Login Tracking to User Management

**New Columns on `/admin/users`:**
- **Logins** - Number of tracked logins per user (md+ screens)
- **Last Login** - Per-user last sign-in timestamp (lg+ screens)

**Files:**
- `app/[locale]/admin/users/page.tsx` - Fetches auth data via RPC, passes to table
- `components/admin/user-management-table.tsx` - Added `authDataMap` prop and new columns
- `supabase/migrations/20260122_001_user_auth_data.sql` - Creates:
  - `login_events` table for tracking login counts
  - `get_users_with_login_stats()` RPC function

---

## Architecture Notes

### Analytics Data Flow

```
Admin Page (Server Component)
    ↓
getFullDashboardData() - Parallel fetch of 9 RPC functions
    ↓
Each RPC function has try-catch, returns null/[] on error
    ↓
StatCard components receive ReactNode icons (not functions)
    ↓
Charts receive data arrays, handle empty state gracefully
```

### Key Pattern: Server → Client Component Icon Passing

```tsx
// ❌ WRONG - Passing function to client component
<StatCard icon={Users} />

// ✅ CORRECT - Passing rendered JSX
<StatCard icon={<Users className="h-6 w-6 text-primary" />} />
```

### RPC Functions (Supabase)

| Function | Returns | Used By |
|----------|---------|---------|
| `get_dashboard_overview` | User/event/RSVP counts | Main dashboard |
| `get_session_stats` | Total logins, active today, last login | Main dashboard |
| `get_users_with_login_stats` | Per-user login count + last login | User management |
| `get_user_growth` | Time series data | User growth chart |
| `get_role_distribution` | Role breakdown | Role distribution chart |
| `get_event_activity` | Event creation over time | Event activity chart |
| `get_rsvp_trends` | RSVP trends over time | RSVP trends chart |
| `get_verification_queue_stats` | Pending/approved counts | Verification card |
| `get_extraction_stats` | AI extraction metrics | Extraction stats |
| `get_festival_stats` | Festival counts | Festival card |

---

## Known Limitations

### 1. Login Count Tracking

The `login_events` table was just created, so:
- **Existing users show 0 logins** - Historical logins weren't tracked
- **Future logins not yet tracked** - Need to add Supabase Auth webhook or trigger

**To enable login tracking**, add a Supabase Auth hook:
```sql
-- Example: Trigger on auth.users update
CREATE OR REPLACE FUNCTION track_user_login()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    INSERT INTO public.login_events (user_id, logged_in_at)
    VALUES (NEW.id, NEW.last_sign_in_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION track_user_login();
```

### 2. Missing RPC Functions

If any RPC function doesn't exist in Supabase, the dashboard gracefully shows 0/empty data instead of crashing. Check Vercel logs for "Error fetching..." messages to identify missing functions.

### 3. Stats Grid Responsiveness

The main dashboard stats grid uses:
- `xl:grid-cols-6` - 6 cards on extra-large screens
- `lg:grid-cols-3` - 3 cards on large screens
- `sm:grid-cols-2` - 2 cards on small screens

If adding more stat cards, consider the layout impact.

---

## File Reference

### Core Admin Files
```
app/[locale]/admin/
├── page.tsx              # Main dashboard with stats + charts
├── layout.tsx            # Auth check, role validation
└── users/
    └── page.tsx          # User management with login stats

components/admin/
├── analytics/
│   ├── index.ts          # Barrel export
│   ├── stat-card.tsx     # Generic stat card (icon: ReactNode)
│   ├── user-growth-chart.tsx
│   ├── role-distribution-chart.tsx
│   ├── event-activity-chart.tsx
│   ├── rsvp-trends-chart.tsx
│   └── verification-queue-card.tsx
└── user-management-table.tsx  # User list with role editing

lib/admin/
└── analytics.ts          # All analytics fetch functions

lib/types/index.ts        # DashboardOverview, SessionStats types
```

### Migrations
```
supabase/migrations/
├── 20260121_001_session_stats.sql      # get_session_stats()
└── 20260122_001_user_auth_data.sql     # login_events + get_users_with_login_stats()
```

---

## Testing Checklist

- [ ] `/admin` loads without 500 error
- [ ] All 6 stat cards display (or show 0/—)
- [ ] Charts render (or show "No data available")
- [ ] `/admin/users` shows Logins and Last Login columns
- [ ] Role changes work via dropdown
- [ ] Mobile responsive layout works

---

## Next Steps / Ideas

1. **Enable login tracking** - Add Supabase Auth trigger (see above)
2. **Add refresh button** - Allow manual data refresh without page reload
3. **Add date range selector** - Filter charts by custom date range
4. **Export functionality** - CSV export of user data
5. **Real-time updates** - Supabase realtime for live dashboard updates
