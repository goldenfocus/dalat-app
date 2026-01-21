# Handover: Filtering, Categories, Map & Calendar Integration

## Branch
`g-c-2` (pushed to origin)

## What Was Done This Session

### 1. Explore Page Filtering
**File:** `components/explore/explore-view.tsx`

Added a unified filter system for both Map and Calendar views:
- Filter button in the toggle bar (shows badge with active filter count)
- Client-side filtering for: search, categories, date range, price
- Shared FilterPanel component between both views

### 2. Desktop Navigation Cleanup
**File:** `components/navigation/bottom-nav.tsx`

Removed "Me" tab from desktop TopNavBar (line 81) since it duplicates profile access from the avatar dropdown.

### 3. Event Categories Integration
**New File:** `components/events/category-selector.tsx`

- `CategorySelector` component with checkbox grid
- Fetches from `event_categories` table (with hardcoded fallback)
- Max 3 selections allowed
- Helper functions: `saveCategoryAssignments()`, `fetchEventCategories()`

**File:** `components/events/event-form.tsx`

- Added category selector after description field (line 604-610)
- Loads existing categories when editing (line 192-196)
- Saves to `event_category_assignments` table on create/update

### 4. Map Header Toggle
**File:** `components/map/map-landing-page.tsx`

Added `hideHeader` prop to hide the duplicate header when embedded in ExploreView.

---

## Architecture Overview: How Everything Connects

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /explore page                                                   │
│  ├── ExploreView (components/explore/explore-view.tsx)          │
│  │   ├── [Map | Calendar] toggle                                │
│  │   ├── Filter button → opens FilterPanel                      │
│  │   ├── Client-side filtering (useMemo)                        │
│  │   │                                                          │
│  │   ├── MapLandingPage (when Map selected)                     │
│  │   │   ├── UnifiedMap → Google Maps with markers              │
│  │   │   ├── EventCarousel → horizontal scroll cards            │
│  │   │   └── Uses filteredEvents from parent                    │
│  │   │                                                          │
│  │   └── EventCalendarView (when Calendar selected)             │
│  │       ├── Month/Week/Day/Agenda views                        │
│  │       └── Uses filteredEvents from parent                    │
│  │                                                               │
│  └── FilterPanel (components/events/filter-panel.tsx)           │
│      ├── Search input                                            │
│      ├── Category checkboxes (hardcoded list)                   │
│      ├── Date range picker                                       │
│      ├── Price filter (All/Free/Paid)                           │
│      └── Distance filter (requires geolocation)                 │
│                                                                  │
│  /events/new page                                                │
│  └── EventForm (components/events/event-form.tsx)               │
│      ├── CategorySelector (new!)                                │
│      │   └── Fetches from event_categories table                │
│      └── PlaceAutocomplete                                       │
│          └── Google Places API → saves lat/lng                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE (Supabase)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  events                                                          │
│  ├── id, title, description, starts_at                          │
│  ├── location_name, address, google_maps_url                    │
│  ├── latitude, longitude  ← For map markers (need migration!)   │
│  └── created_by, status, slug                                   │
│                                                                  │
│  event_categories                                                │
│  ├── id (text): 'music', 'yoga', 'food', etc.                   │
│  ├── name_en, name_vi                                           │
│  ├── icon (emoji), color (hex)                                  │
│  └── sort_order, is_active                                      │
│                                                                  │
│  event_category_assignments (junction table)                    │
│  ├── event_id (uuid) → events.id                                │
│  └── category_id (text) → event_categories.id                   │
│                                                                  │
│  RPC: filter_events() (optional, for server-side filtering)     │
│  └── supabase/migrations/20260301_004_filter_events_rpc.sql     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Filtering

```
1. User opens /explore
   └── app/[locale]/explore/page.tsx fetches ALL upcoming events

2. ExploreView receives events
   └── Stores in state, passes to child views

3. User clicks Filter button
   └── FilterPanel opens as slide-over drawer

4. User selects filters and clicks Apply
   └── FilterPanel calls onApplyFilters(filters)
   └── ExploreView updates filter state
   └── useMemo recalculates filteredEvents
   └── Child views (Map/Calendar) re-render with filtered data

5. Client-side filtering logic (explore-view.tsx lines 35-77):
   - searchQuery: title, location_name, description ILIKE
   - categories: event.category_ids includes any selected
   - dateRange: starts_at between start and end
   - priceFilter: event.is_free === true/false
```

---

## Data Flow: Map Markers

```
1. Events need latitude/longitude to show on map

2. Current state:
   - PlaceAutocomplete extracts coords from Google Places
   - BUT: lat/lng columns may not exist in DB yet!

3. Required migration (run in Supabase SQL editor):

   ALTER TABLE events
   ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
   ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

4. Backfill existing events:
   npx tsx scripts/backfill-coordinates.ts --dry-run
   npx tsx scripts/backfill-coordinates.ts

5. Map component (components/map/unified-map.tsx):
   - Reads event.latitude, event.longitude
   - Creates markers for events with coords
   - Falls back to Da Lat center if no coords
```

---

## Data Flow: Categories

```
1. Category definition:
   - Database: event_categories table (12 pre-populated)
   - Fallback: FALLBACK_CATEGORIES in category-selector.tsx

2. Creating event with categories:
   a. User selects categories in CategorySelector
   b. Form submits → creates event in events table
   c. saveCategoryAssignments(eventId, categoryIds)
      └── Inserts into event_category_assignments

3. Editing event:
   a. fetchEventCategories(eventId) loads existing assignments
   b. User modifies selection
   c. saveCategoryAssignments() deletes old, inserts new

4. Filtering by category:
   - Currently: client-side check of event.category_ids array
   - Advanced: filter_events RPC joins category_assignments
```

---

## Still Pending / Known Issues

### Database Migration Required
The `latitude` and `longitude` columns may not exist yet:

```sql
-- Run in Supabase Dashboard SQL Editor
ALTER TABLE events
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_events_coordinates
ON events (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

### Category Permissions
Ensure authenticated users can write to junction table:

```sql
GRANT INSERT, DELETE ON event_category_assignments TO authenticated;
```

### Filter RPC (Optional Enhancement)
For server-side filtering with PostGIS distance calculations:
- Migration exists: `supabase/migrations/20260301_004_filter_events_rpc.sql`
- API client exists: `lib/events/filter-events-api.ts`
- Currently using client-side filtering (simpler, works without RPC)

### Category Filter Not Fully Connected
The filter currently checks `event.category_ids` but:
- This field only exists when using `filter_events` RPC
- Simple event queries don't include category assignments
- To fix: Either use RPC or join categories in the fetch query

---

## Files Modified This Session

```
components/events/category-selector.tsx     # NEW - Category selection UI
components/events/event-form.tsx            # Added CategorySelector
components/explore/explore-view.tsx         # Added filtering
components/map/map-landing-page.tsx         # Added hideHeader prop
components/navigation/bottom-nav.tsx        # Removed Me from desktop
messages/*.json                             # Added translations
```

---

## Testing URLs

- Home: http://localhost:3001/en
- Explore (Map/Calendar): http://localhost:3001/en/explore
- Create Event: http://localhost:3001/en/events/new
- Vercel Preview: Check your Vercel dashboard for g-c-2 branch deploy

---

## Next Steps

1. **Run database migration** for lat/lng columns
2. **Run backfill script** to populate coordinates
3. **Test category selector** on event creation page
4. **Verify map markers** appear after backfill
5. **Consider server-side filtering** if client-side becomes slow

---

## Quick Commands

```bash
# Start dev server
npm run dev

# Run build check
npm run build

# Backfill coordinates (after migration)
npx tsx scripts/backfill-coordinates.ts --dry-run
npx tsx scripts/backfill-coordinates.ts

# Push changes
git add -A && git commit -m "message" && git push origin g-c-2
```

---

## Git Status

```
Branch: g-c-2
Remote: origin/g-c-2
Last commit: feat: add filtering to Explore page & event categories
```

Main branch has newer commits (notification system, security fixes) - merge when ready.
