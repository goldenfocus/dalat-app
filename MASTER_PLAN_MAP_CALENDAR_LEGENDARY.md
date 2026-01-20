# 🚀 Legendary Calendar & Map Feature - Master Implementation Plan

## 📋 Quick Start for AI Assistant

**Project**: dalat.app - Event discovery platform for Da Lat, Vietnam
**Goal**: Add legendary calendar/map features with advanced filtering
**Tech Stack**: Next.js 15, Supabase, TypeScript, Google Maps, Tailwind CSS
**Timeline**: 7-day sprint

---

## 🎯 Overview

Transform dalat.app into a viral-worthy event discovery platform with:

- 🗺️ **Google Maps** - Premium interface with clustering & geolocation
- 📅 **Enhanced Calendar** - Month/Week/Day/Agenda views
- 🎯 **Advanced Filtering** - Categories, price, distance, dates, search
- 🔗 **Shareable URLs** - Every filter combo gets a unique URL for viral growth
- 📱 **Mobile-First** - 44px touch targets, gestures, haptic feedback
- ⚡ **Performance** - Handles 1000+ events smoothly

---

## 🗺️ Why Google Maps?

**User's Decision**: Premium experience over cost savings

✅ Best-in-class UX users know and trust
✅ Superior mobile experience (pinch zoom, rotation, tilt)
✅ Built-in "Get Directions" integration
✅ Street View for venue exploration
✅ Accurate POI data for Vietnam
✅ Professional polish for a legendary product

**Cost**: ~$7 per 1000 map loads after $200 monthly credit
**Budget**: $200-500/mo at scale - worth it for quality

---

## 📊 Database Schema Changes

### Migration 1: Add Price Fields
**File**: `supabase/migrations/20260301_001_add_event_price.sql`

```sql
-- Add pricing support to events table
ALTER TABLE events
ADD COLUMN price_type text DEFAULT 'free'
  CHECK (price_type IN ('free', 'paid', 'donation', 'free_with_rsvp')),
ADD COLUMN price_amount numeric(10,2),
ADD COLUMN price_currency text DEFAULT 'VND',
ADD COLUMN price_note text;

CREATE INDEX idx_events_price_type ON events(price_type)
WHERE status = 'published';

COMMENT ON COLUMN events.price_type IS 'Event pricing model: free, paid, donation, or free_with_rsvp';
COMMENT ON COLUMN events.price_amount IS 'Price in specified currency (null for free/donation)';
```

### Migration 2: Categories System
**File**: `supabase/migrations/20260301_002_event_categories.sql`

```sql
-- Event categories table
CREATE TABLE event_categories (
  id text PRIMARY KEY, -- e.g., 'music', 'yoga', 'food'
  name_en text NOT NULL,
  name_vi text,
  icon text, -- emoji or icon name
  color text, -- hex color for UI
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Many-to-many junction table
CREATE TABLE event_category_assignments (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  category_id text REFERENCES event_categories ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

CREATE INDEX idx_event_category_assignments_event
  ON event_category_assignments(event_id);
CREATE INDEX idx_event_category_assignments_category
  ON event_category_assignments(category_id);

-- Pre-populate categories
INSERT INTO event_categories (id, name_en, name_vi, icon, color, sort_order) VALUES
('music', 'Music', 'Âm nhạc', '🎵', '#8B5CF6', 1),
('yoga', 'Yoga & Wellness', 'Yoga', '🧘', '#10B981', 2),
('food', 'Food & Dining', 'Ẩm thực', '🍜', '#F59E0B', 3),
('art', 'Art & Culture', 'Nghệ thuật', '🎨', '#EC4899', 4),
('meditation', 'Meditation', 'Thiền', '🧘‍♀️', '#6366F1', 5),
('festival', 'Festivals', 'Lễ hội', '🎉', '#EF4444', 6),
('nature', 'Nature & Outdoors', 'Thiên nhiên', '🌿', '#059669', 7),
('community', 'Community', 'Cộng đồng', '👥', '#3B82F6', 8),
('education', 'Education', 'Giáo dục', '📚', '#0EA5E9', 9),
('sports', 'Sports & Fitness', 'Thể thao', '⚽', '#F97316', 10),
('nightlife', 'Nightlife', 'Đêm', '🌙', '#A855F7', 11),
('coffee', 'Coffee & Tea', 'Cà phê', '☕', '#92400E', 12);

GRANT SELECT ON event_categories TO anon, authenticated;
GRANT SELECT ON event_category_assignments TO anon, authenticated;
```

### Migration 3: PostGIS for Geospatial Queries
**File**: `supabase/migrations/20260301_003_enable_postgis.sql`

```sql
-- Enable PostGIS extension for distance calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column for efficient spatial queries
ALTER TABLE events
ADD COLUMN location_point geography(Point, 4326);

-- Backfill existing events with coordinates
UPDATE events
SET location_point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create spatial index (GIST)
CREATE INDEX idx_events_location_point ON events USING GIST(location_point);

-- Trigger to auto-update location_point when lat/lng changes
CREATE OR REPLACE FUNCTION update_event_location_point()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_point = ST_SetSRID(
      ST_MakePoint(NEW.longitude, NEW.latitude), 4326
    )::geography;
  ELSE
    NEW.location_point = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_location_point_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON events
FOR EACH ROW EXECUTE FUNCTION update_event_location_point();
```

### Migration 4: Advanced Filter RPC Function
**File**: `supabase/migrations/20260301_004_filter_events_rpc.sql`

```sql
-- Comprehensive event filtering with geospatial support
CREATE OR REPLACE FUNCTION filter_events(
  p_lifecycle text DEFAULT 'upcoming',
  p_categories text[] DEFAULT NULL,
  p_price_filter text DEFAULT 'all',
  p_search_query text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_user_lat double precision DEFAULT NULL,
  p_user_lng double precision DEFAULT NULL,
  p_radius_km double precision DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  description text,
  image_url text,
  location_name text,
  address text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  price_type text,
  price_amount numeric,
  price_currency text,
  capacity int,
  distance_km double precision,
  category_ids text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_point geography;
BEGIN
  -- Create user location point if coordinates provided
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    v_user_point := ST_SetSRID(
      ST_MakePoint(p_user_lng, p_user_lat), 4326
    )::geography;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.slug,
    e.title,
    e.description,
    e.image_url,
    e.location_name,
    e.address,
    e.latitude,
    e.longitude,
    e.starts_at,
    e.ends_at,
    e.price_type,
    e.price_amount,
    e.price_currency,
    e.capacity,
    -- Calculate distance in kilometers if user location provided
    CASE
      WHEN v_user_point IS NOT NULL AND e.location_point IS NOT NULL
      THEN ST_Distance(v_user_point, e.location_point) / 1000.0
      ELSE NULL
    END AS distance_km,
    -- Aggregate category IDs
    ARRAY(
      SELECT eca.category_id
      FROM event_category_assignments eca
      WHERE eca.event_id = e.id
    ) AS category_ids
  FROM events e
  WHERE
    -- Published events only
    e.status = 'published'

    -- Lifecycle filter
    AND CASE p_lifecycle
      WHEN 'upcoming' THEN e.starts_at > now()
      WHEN 'happening' THEN
        e.starts_at <= now() AND
        (e.ends_at >= now() OR (e.ends_at IS NULL AND e.starts_at + interval '4 hours' >= now()))
      WHEN 'past' THEN
        (e.ends_at IS NOT NULL AND e.ends_at < now()) OR
        (e.ends_at IS NULL AND e.starts_at + interval '4 hours' < now())
      ELSE true
    END

    -- Category filter (events must have at least one matching category)
    AND (
      p_categories IS NULL
      OR EXISTS (
        SELECT 1 FROM event_category_assignments eca
        WHERE eca.event_id = e.id AND eca.category_id = ANY(p_categories)
      )
    )

    -- Price filter
    AND (
      p_price_filter = 'all'
      OR (p_price_filter = 'free' AND e.price_type IN ('free', 'free_with_rsvp', 'donation'))
      OR (p_price_filter = 'paid' AND e.price_type = 'paid')
    )

    -- Search query (title, description, location)
    AND (
      p_search_query IS NULL
      OR p_search_query = ''
      OR e.title ILIKE '%' || p_search_query || '%'
      OR e.description ILIKE '%' || p_search_query || '%'
      OR e.location_name ILIKE '%' || p_search_query || '%'
    )

    -- Date range filter
    AND (p_start_date IS NULL OR e.starts_at >= p_start_date)
    AND (p_end_date IS NULL OR e.starts_at <= p_end_date)

    -- Distance/radius filter (only if user location and radius provided)
    AND (
      v_user_point IS NULL
      OR p_radius_km IS NULL
      OR e.location_point IS NULL
      OR ST_DWithin(v_user_point, e.location_point, p_radius_km * 1000)
    )
  ORDER BY
    -- Sort by distance if user location provided, otherwise by date
    CASE
      WHEN v_user_point IS NOT NULL AND e.location_point IS NOT NULL
      THEN ST_Distance(v_user_point, e.location_point)
      ELSE NULL
    END ASC NULLS LAST,
    CASE WHEN p_lifecycle = 'past' THEN e.starts_at END DESC NULLS LAST,
    CASE WHEN p_lifecycle != 'past' THEN e.starts_at END ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION filter_events TO anon, authenticated;

COMMENT ON FUNCTION filter_events IS
  'Advanced event filtering with categories, price, search, date range, and geospatial queries';
```

---

## 📦 TypeScript Types

**File**: `lib/types/index.ts` (add these types)

```typescript
// ============================================
// FILTER & CATEGORY TYPES
// ============================================

export type PriceType = 'free' | 'paid' | 'donation' | 'free_with_rsvp';

export interface EventCategory {
  id: string;
  name_en: string;
  name_vi: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface EventWithFilterData extends Event {
  price_type: PriceType;
  price_amount: number | null;
  price_currency: string;
  price_note: string | null;
  distance_km: number | null;
  category_ids: string[];
  categories?: EventCategory[];
}

export interface EventFilters {
  lifecycle: 'upcoming' | 'happening' | 'past';
  categories: string[];
  priceFilter: 'all' | 'free' | 'paid';
  searchQuery: string;
  dateRange?: { start: Date; end: Date };
  userLocation?: { lat: number; lng: number };
  radiusKm?: number;
  viewMode: 'list' | 'grid' | 'map' | 'calendar';
  calendarView?: 'month' | 'week' | 'day' | 'agenda';
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationState {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  permissionState: 'granted' | 'denied' | 'prompt' | null;
}
```

---

## 🪝 Custom Hooks

### Geolocation Hook
**File**: `lib/hooks/use-geolocation.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GeolocationState, UserLocation } from '@/lib/types';

const DALAT_DEFAULT = { lat: 11.9404, lng: 108.4583 };
const LOCATION_CACHE_KEY = 'dalat_user_location';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export function useGeolocation(autoRequest = false) {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: false,
    error: null,
    permissionState: null,
  });

  // Check cached location on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cached = localStorage.getItem(LOCATION_CACHE_KEY);
    if (cached) {
      try {
        const loc: UserLocation = JSON.parse(cached);
        if (Date.now() - loc.timestamp < CACHE_DURATION_MS) {
          setState(prev => ({ ...prev, location: loc }));
          return;
        }
      } catch {}
    }

    if (autoRequest) {
      requestLocation();
    }
  }, [autoRequest]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation not supported',
        loading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        };

        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));

        setState({
          location,
          loading: false,
          error: null,
          permissionState: 'granted',
        });
      },
      (error) => {
        let errorMsg = 'Unable to get location';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Location permission denied';
          setState(prev => ({ ...prev, permissionState: 'denied' }));
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Location request timed out';
        }

        setState(prev => ({
          ...prev,
          error: errorMsg,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: CACHE_DURATION_MS,
      }
    );
  }, []);

  const clearLocation = useCallback(() => {
    localStorage.removeItem(LOCATION_CACHE_KEY);
    setState({
      location: null,
      loading: false,
      error: null,
      permissionState: null,
    });
  }, []);

  return {
    ...state,
    requestLocation,
    clearLocation,
    hasLocation: state.location !== null,
  };
}
```

### Event Filters Hook
**File**: `lib/hooks/use-event-filters.ts`

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { EventFilters } from '@/lib/types';
import { filtersToSearchParams, searchParamsToFilters } from '@/lib/events/filter-url-state';

const DEFAULT_FILTERS: EventFilters = {
  lifecycle: 'upcoming',
  categories: [],
  priceFilter: 'all',
  searchQuery: '',
  viewMode: 'list',
};

export function useEventFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize filters from URL
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...searchParamsToFilters(searchParams),
  }));

  // Sync URL when filters change
  const updateURL = useCallback((newFilters: EventFilters) => {
    const params = filtersToSearchParams(newFilters);
    const search = params.toString();
    router.push(`${pathname}${search ? `?${search}` : ''}`, { scroll: false });
  }, [pathname, router]);

  const setFilter = useCallback(<K extends keyof EventFilters>(
    key: K,
    value: EventFilters[K]
  ) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  const updateFilters = useCallback((partial: Partial<EventFilters>) => {
    setFilters(prev => {
      const updated = { ...prev, ...partial };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    updateURL(DEFAULT_FILTERS);
  }, [updateURL]);

  const toggleCategory = useCallback((categoryId: string) => {
    setFilters(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId];
      const updated = { ...prev, categories };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  // Count active filters (excluding defaults)
  const activeFilterCount =
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.priceFilter !== 'all' ? 1 : 0) +
    (filters.searchQuery ? 1 : 0) +
    (filters.dateRange ? 1 : 0) +
    (filters.radiusKm ? 1 : 0);

  return {
    filters,
    setFilter,
    updateFilters,
    resetFilters,
    toggleCategory,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
}
```

### URL State Utilities
**File**: `lib/events/filter-url-state.ts`

```typescript
import { EventFilters } from '@/lib/types';

export function filtersToSearchParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.lifecycle !== 'upcoming') params.set('lifecycle', filters.lifecycle);
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','));
  if (filters.priceFilter !== 'all') params.set('price', filters.priceFilter);
  if (filters.searchQuery) params.set('q', filters.searchQuery);
  if (filters.dateRange) {
    params.set('from', filters.dateRange.start.toISOString().split('T')[0]);
    params.set('to', filters.dateRange.end.toISOString().split('T')[0]);
  }
  if (filters.radiusKm) params.set('radius', filters.radiusKm.toString());
  if (filters.viewMode !== 'list') params.set('view', filters.viewMode);
  if (filters.calendarView && filters.viewMode === 'calendar') {
    params.set('calView', filters.calendarView);
  }

  return params;
}

export function searchParamsToFilters(searchParams: URLSearchParams): Partial<EventFilters> {
  const filters: Partial<EventFilters> = {};

  const lifecycle = searchParams.get('lifecycle');
  if (lifecycle && ['upcoming', 'happening', 'past'].includes(lifecycle)) {
    filters.lifecycle = lifecycle as EventFilters['lifecycle'];
  }

  const categories = searchParams.get('categories');
  if (categories) filters.categories = categories.split(',').filter(Boolean);

  const price = searchParams.get('price');
  if (price && ['all', 'free', 'paid'].includes(price)) {
    filters.priceFilter = price as EventFilters['priceFilter'];
  }

  const q = searchParams.get('q');
  if (q) filters.searchQuery = q;

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from && to) {
    filters.dateRange = {
      start: new Date(from),
      end: new Date(to)
    };
  }

  const radius = searchParams.get('radius');
  if (radius) filters.radiusKm = parseFloat(radius);

  const view = searchParams.get('view');
  if (view && ['list', 'grid', 'map', 'calendar'].includes(view)) {
    filters.viewMode = view as EventFilters['viewMode'];
  }

  const calView = searchParams.get('calView');
  if (calView && ['month', 'week', 'day', 'agenda'].includes(calView)) {
    filters.calendarView = calView as EventFilters['calendarView'];
  }

  return filters;
}

export function getShareableFilterUrl(filters: EventFilters, baseUrl: string): string {
  const params = filtersToSearchParams(filters);
  return `${baseUrl}?${params.toString()}`;
}
```

---

## 🎨 UI Components Overview

### 1. Unified Filter Drawer
- Enhance existing `filter-panel.tsx`
- Add distance/radius selector (1km, 5km, 10km, 25km, all)
- Add quick presets: Near Me, This Weekend, Free Events, Trending
- Show active filter chips with X buttons
- Real-time event count

### 2. Google Maps View
- **Package**: `@googlemaps/react-wrapper` + `@googlemaps/markerclusterer`
- Custom styled map matching dalat.app theme
- Marker clustering (zoom 1-14 cluster, 15+ individual)
- Category-colored SVG marker pins
- "Near Me" button with blue pulsing marker
- Radius circle visualization
- Rich InfoWindow with event preview + RSVP
- "Get Directions" link

### 3. Enhanced Calendar
- Extend existing calendar component
- Add Agenda View (chronological list)
- Export to ICS functionality
- Mini calendar with event dots
- Multi-event day popovers

### 4. View Mode Switcher
- Floating action bar: List, Grid, Map, Calendar
- Mobile: Bottom-right floating
- Desktop: Top toolbar
- Green active state

---

## 📦 Required Packages

```bash
npm install @googlemaps/react-wrapper @googlemaps/markerclusterer
```

**Already installed**:
- `leaflet` (can keep for fallback)
- `react-leaflet`
- `react-big-calendar`
- `date-fns`

---

## 🌍 i18n Translation Keys

Add to all 12 locale files (`messages/{locale}.json`):

```json
{
  "filters": {
    "title": "Filters",
    "categories": "Categories",
    "price": "Price",
    "priceAll": "All Events",
    "priceFree": "Free Only",
    "pricePaid": "Paid Only",
    "dateRange": "Date Range",
    "distance": "Distance",
    "nearMe": "Near Me",
    "thisWeekend": "This Weekend",
    "freeEvents": "Free Events",
    "trending": "Trending",
    "apply": "Apply Filters",
    "clear": "Clear All",
    "activeFilters": "Active Filters",
    "viewMode": {
      "list": "List",
      "grid": "Grid",
      "map": "Map",
      "calendar": "Calendar"
    },
    "calendarView": {
      "month": "Month",
      "week": "Week",
      "day": "Day",
      "agenda": "Agenda"
    }
  },
  "geolocation": {
    "requestPermission": "Enable location to see events near you",
    "permissionDenied": "Location permission denied",
    "errorTimeout": "Location request timed out",
    "enable": "Enable Location"
  }
}
```

---

## 📝 Implementation Checklist

### ✅ Day 1-2: Database & Backend
- [ ] Run migration 001: Add price fields
- [ ] Run migration 002: Categories system
- [ ] Run migration 003: PostGIS + location_point
- [ ] Run migration 004: filter_events() RPC
- [ ] Test RPC with various filter combinations
- [ ] Backfill events: `price_type='free'` for all existing
- [ ] Geocode missing lat/lng (Google Places API)

### ✅ Day 3-4: TypeScript & Hooks
- [ ] Add types to `lib/types/index.ts`
- [ ] Create `lib/hooks/use-geolocation.ts`
- [ ] Create `lib/hooks/use-event-filters.ts`
- [ ] Create `lib/events/filter-url-state.ts`
- [ ] Test URL state synchronization

### ✅ Day 5: Filter UI Components
- [ ] Create `components/events/unified-filter-drawer.tsx`
- [ ] Add distance/radius selector
- [ ] Add quick filter presets
- [ ] Create `components/events/view-mode-switcher.tsx`
- [ ] Create `components/events/filter-presets.tsx`
- [ ] Add i18n keys to all 12 locales

### ✅ Day 6: Google Maps & Calendar
- [ ] Install: `npm install @googlemaps/react-wrapper @googlemaps/markerclusterer`
- [ ] Create `components/events/google-map-view.tsx`
- [ ] Implement custom styled Google Maps
- [ ] Add MarkerClusterer with custom icons
- [ ] Create category-colored SVG markers
- [ ] Add "Near Me" button with geolocation
- [ ] Add radius circle visualization
- [ ] Create rich InfoWindow component
- [ ] Enhance calendar with Agenda view
- [ ] Add ICS export functionality

### ✅ Day 7: Integration & Polish
- [ ] Update `app/[locale]/map/page.tsx` - use filter_events() RPC
- [ ] Update `app/[locale]/calendar/page.tsx` - use filter_events() RPC
- [ ] Connect filter drawer to both pages
- [ ] Add active filter count badges
- [ ] Add shareable URL copy button
- [ ] Test mobile gestures & 44px touch targets
- [ ] Performance test with 500+ events
- [ ] Cross-browser testing

---

## 🎯 Success Criteria

✅ **UX Goals**
- Find events by location in <10 seconds
- Mobile experience is 60fps smooth
- Shareable URLs work on social media

✅ **Technical Goals**
- Map handles 500+ events without lag
- Filter RPC executes in <200ms
- All 44px touch targets on mobile
- i18n works for all 12 locales

✅ **Performance Targets**
- Map loads in <2s on 4G
- Marker clustering prevents lag
- Filter changes update UI in <100ms
- Calendar renders 200 events smoothly

---

## 🔧 Environment Setup

**Already configured**:
- ✅ `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`
- ✅ Supabase credentials
- ✅ Next.js 15 with App Router
- ✅ Tailwind CSS with mobile-first design tokens

---

## 🚀 Key Design Principles

1. **Mobile-First**: 44px touch targets, gestures, haptic feedback
2. **Performance**: Virtual scrolling, clustering, spatial indexes
3. **Viral**: Shareable URLs, social previews, "Near Me" feature
4. **i18n**: All 12 locales supported from day 1
5. **Progressive**: Graceful degradation (map works without geolocation)
6. **Google Maps**: Premium UX worth the cost

---

## 📚 Existing Codebase Context

**Current Event Schema**:
- Has: `latitude`, `longitude`, `location_name`, `address`, `starts_at`, `ends_at`
- Missing: `price_type`, `price_amount`, categories (will be added)

**Existing Components**:
- `components/events/filter-panel.tsx` - Basic filter UI (enhance this)
- `components/events/event-map-view.tsx` - Leaflet map (replace with Google Maps)
- `components/events/event-calendar-view.tsx` - Calendar with Month/Week/Day (enhance with Agenda)
- `components/events/event-card.tsx` - Event card component

**Design System**:
- Green accent: `#16a34a` (green-600)
- Mobile-first with 44px touch targets
- Dark mode support via CSS variables
- shadcn/ui components

**Routing**:
- `/[locale]/map` - Map view page
- `/[locale]/calendar` - Calendar view page
- 12 locales: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id

---

## 🎬 Ready to Start?

**You have**:
✅ Complete database migrations
✅ TypeScript types
✅ Custom hooks (geolocation, filters, URL state)
✅ Component specifications
✅ i18n keys
✅ Implementation checklist

**Next steps**:
1. Run database migrations
2. Add TypeScript types
3. Create hooks
4. Build UI components
5. Integrate everything

Let's build something legendary! 🚀
