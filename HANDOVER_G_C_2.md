# Handover: g-c-2 Branch

## Branch
`g-c-2` (pushed to origin)

## What Was Done This Session

### 1. Calendar Week View Fixed for Mobile
**File:** `components/events/event-calendar-view.tsx`

**Changes:**
- Week view now horizontally scrollable on mobile (`overflow-x-auto`)
- Uses flexbox on mobile, grid on desktop (`flex lg:grid lg:grid-cols-7`)
- Each day card has `min-w-[100px]` for consistent sizing on mobile
- Responsive text sizes (`text-xs lg:text-sm`, `text-lg lg:text-2xl`)
- Limited to 2 events per day with "+X more" indicator
- Smaller padding on mobile (`p-3 lg:p-4`)

### 2. Renamed "Agenda" to "All"
**File:** `components/events/event-calendar-view.tsx` (line 222)

Changed the button label from "Agenda" to "All" for clearer meaning.

### 3. Added Missing i18n Translations
**Files:** `messages/es.json`, `messages/zh.json`

Added the missing `search` section to both Spanish and Chinese locales to fix build errors.

## Files Modified This Session

```
components/events/event-calendar-view.tsx   # Week view mobile fix + Agenda→All
messages/es.json                            # Added search translations
messages/zh.json                            # Added search translations
```

## Previous Session Work (from ui-2 branch, included in this commit)

All the work from the previous session was also committed:
- Bottom navigation redesign (4 items with floating Add button)
- Desktop TopNavBar component
- Explore page with Map/Calendar toggle
- Navigation config updates
- Map hideTopNav prop
- Backfill scripts for coordinates

## Still Pending

### Database Migration Required

The `latitude` and `longitude` columns don't exist in the events table yet.

#### Step 1: Run Migration in Supabase Dashboard

Go to: **https://supabase.com/dashboard/project/aljcmodwjqlznzcydyor/sql**

Run this SQL:

```sql
-- Add latitude and longitude columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_events_coordinates ON events (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comments
COMMENT ON COLUMN events.latitude IS 'Latitude coordinate for map display';
COMMENT ON COLUMN events.longitude IS 'Longitude coordinate for map display';
```

#### Step 2: Run Backfill Script

After the migration, backfill existing events that have Google Maps URLs:

```bash
# Preview what will be updated
npx tsx scripts/backfill-coordinates.ts --dry-run

# Apply changes
npx tsx scripts/backfill-coordinates.ts
```

#### Step 3: Verify Map Shows Events

After backfill, visit `/explore` and the map should show markers for events with coordinates.

## Testing URLs

- Home: http://localhost:3001/en
- Explore (Map): http://localhost:3001/en/explore
- Calendar: http://localhost:3001/en/explore (toggle to Calendar)
- Week View: Toggle to "Week" in Calendar view - should scroll horizontally on mobile

## Git Status

```
Branch: g-c-2
Remote: origin/g-c-2
Last commit: feat: improve calendar week view for mobile & rename Agenda to All
```

## Known Issues

- Google Maps may show "ApiTargetBlockedMapError" if Maps JavaScript API is not enabled
- Events without `google_maps_url` won't get coordinates from backfill
- Mobile bottom nav "Add" button overlaps the nav border slightly (intentional)
