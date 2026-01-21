# Handover: UI Navigation & Map/Calendar Implementation

## Branch
`ui-2`

## What Was Done This Session

### 1. Bottom Navigation Redesigned (Mobile)
The mobile bottom navigation was completely redesigned with modern UX patterns.

**File:** `components/navigation/bottom-nav.tsx`

**Changes:**
- Changed from 5-column grid to 4-item flexbox layout (Home, Explore, Add, Me)
- Centered items with `max-w-md mx-auto` for better visual balance
- Added floating "Add" button with green background, shadow, and elevated position (`-mt-4`)
- Added glassmorphism effect (`bg-white/95 backdrop-blur-md`)
- Added press feedback with `active:scale-95` transitions
- Active state shows bolder icon stroke and semibold text

**Navigation Items:**
```
Home → /
Explore → /explore (Map/Calendar views)
Add → /events/new (floating green button)
Me → /settings
```

### 2. Desktop Top Navigation Added
Created `TopNavBar` component for desktop view, integrated into `SiteHeader`.

**Files:**
- `components/navigation/bottom-nav.tsx` - Added `TopNavBar` export
- `components/site-header.tsx` - Imported and placed `TopNavBar` next to logo

**Design:**
- Pill-shaped segmented control (`rounded-full` with `bg-gray-100`)
- Active item has white background with green text and subtle shadow
- Shows: Home, Explore, Me (Add button is separate green CTA)

### 3. Navigation Configuration Updated
**File:** `lib/navigation.ts`

```typescript
export const BOTTOM_NAV_ITEMS = [
    { href: '/', label: 'Home', icon: 'Home' as const },
    { href: '/explore', label: 'Explore', icon: 'Compass' as const },
    { href: '/events/new', label: 'Add', icon: 'Plus' as const },
    { href: '/settings', label: 'Me', icon: 'User' as const },
] as const;
```

### 4. Explore Page Created
New page combining Map and Calendar views with a toggle.

**Files:**
- `app/[locale]/explore/page.tsx` - Server component fetching events
- `components/explore/explore-view.tsx` - Client component with view toggle

**Features:**
- Toggle between Map and Calendar at the top
- Map is default view
- Shares same event data between views
- Clean segmented control UI

### 5. Calendar Agenda View Improved
**File:** `components/events/event-calendar-view.tsx`

**Changes:**
- New date header design with circular badge (day abbreviation + number)
- Today's date highlighted with green background
- New `AgendaEventCard` component with:
  - Green left border accent
  - Time and location with icons
  - FREE badge
  - Clean card layout with hover shadow

### 6. Map Integration Updated
**File:** `components/map/map-landing-page.tsx`

- Added `hideTopNav` prop to hide navigation when embedded in ExploreView
- Map uses Google Maps adapter when API key is present

### 7. Backfill Scripts Created
**Files:**
- `scripts/backfill-coordinates.ts` - Extracts lat/lng from Google Maps URLs
- `scripts/run-coordinate-migration.ts` - Checks migration status

## Current Status

### Working
- Homepage with new bottom navigation (mobile)
- Desktop header with TopNavBar
- Explore page with Map/Calendar toggle
- Calendar Agenda view with improved styling
- Google Maps API key is configured

### Pending - Database Migration Required

**The `latitude` and `longitude` columns don't exist in the events table yet.**

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

The script extracts coordinates from various Google Maps URL formats:
- `@lat,lng,zoom` format
- `?q=lat,lng` format
- `/place/lat,lng` format
- `!3d{lat}!4d{lng}` embed format

#### Step 3: Verify Map Shows Events

After backfill, visit `/explore` and the map should show markers for events with coordinates.

## Files Modified This Session

```
lib/navigation.ts                           # Updated nav items to 4 tabs
components/navigation/bottom-nav.tsx        # Redesigned mobile nav + added TopNavBar
components/site-header.tsx                  # Added TopNavBar to desktop header
components/explore/explore-view.tsx         # NEW - Map/Calendar toggle component
app/[locale]/explore/page.tsx               # NEW - Explore page route
components/map/map-landing-page.tsx         # Added hideTopNav prop
components/events/event-calendar-view.tsx   # Improved Agenda view styling
scripts/backfill-coordinates.ts             # NEW - Coordinate extraction script
scripts/run-coordinate-migration.ts         # NEW - Migration checker script
```

## Key Code Patterns

### Bottom Nav with Floating Add Button
```tsx
if (isAddButton) {
    return (
        <Link
            href={item.href}
            className="flex items-center justify-center w-12 h-12 bg-green-600 rounded-full shadow-lg hover:bg-green-700 active:scale-95 transition-all -mt-4"
        >
            <Icon className="w-6 h-6 text-white" />
        </Link>
    );
}
```

### Desktop TopNavBar
```tsx
<nav className="hidden lg:flex items-center gap-1 bg-gray-100 rounded-full p-1">
    {items.map((item) => (
        <Link
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
                isActive ? "bg-white text-green-600 shadow-sm" : "text-gray-600"
            )}
        >
            <Icon /> <span>{item.label}</span>
        </Link>
    ))}
</nav>
```

### Explore View Toggle
```tsx
<div className="inline-flex bg-gray-100 rounded-lg p-1">
    <button
        onClick={() => setViewMode("map")}
        className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md",
            viewMode === "map" ? "bg-white text-green-600 shadow-sm" : "text-gray-600"
        )}
    >
        <MapPin /> Map
    </button>
    <button onClick={() => setViewMode("calendar")} ...>
        <Calendar /> Calendar
    </button>
</div>
```

## Environment Variables

Required for Google Maps:
```
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_key_here
```

The key is already set in `.env.local`.

## Next Steps

1. **Run the database migration** (SQL above)
2. **Run the backfill script** to populate coordinates
3. **Test the map** at `/explore` - should show event markers
4. **Test calendar** - toggle between Map and Calendar views
5. **Test mobile** - verify bottom nav looks good on actual devices
6. **Consider adding** event form coordinate saving (check `components/events/place-autocomplete.tsx`)

## Known Issues

- Google Maps may show "ApiTargetBlockedMapError" if Maps JavaScript API is not enabled in Google Cloud Console
- Events without `google_maps_url` won't get coordinates from backfill - they need manual entry or PlaceAutocomplete
- The mobile bottom nav "Add" button overlaps the nav border slightly (intentional design choice)

## Testing URLs

- Home: http://localhost:3001/en
- Explore (Map): http://localhost:3001/en/explore
- Calendar: http://localhost:3001/en/explore (toggle to Calendar)
- Create Event: http://localhost:3001/en/events/new
