# Venues Feature Implementation Plan

## For the Next AI Agent

You are implementing a **venues feature** for dalat.app - a Da Lat, Vietnam events/discovery platform. This is a comprehensive multi-phase implementation that will take multiple iterations.

**Your mission**: Create an elite venues system that makes users say "wow". Venues are WHERE events happen (physical locations like cafes, bars, galleries). This is separate from Organizers (WHO runs events).

**How to work**:
1. Work through phases sequentially
2. After completing each phase, update the Progress Tracker below
3. Commit after each phase with descriptive messages
4. Run tests and fix any issues before moving to next phase
5. When ALL phases complete, output `<promise>VENUES FEATURE COMPLETE</promise>`

**Critical files to read first**:
- `CLAUDE.md` - Project conventions (ISR patterns, mobile-first, translations)
- `lib/types/index.ts` - Existing type patterns
- `components/map/event-map.tsx` - Map implementation patterns
- `app/[locale]/organizers/[slug]/page.tsx` - Similar page pattern

---

## Progress Tracker

Update this as you complete phases:

- [x] Phase 0: Data Migration Strategy
- [x] Phase 1: Database & Types
- [x] Phase 2: Venues Discovery Page (`/venues`)
- [x] Phase 3: Map Integration
- [x] Phase 4: Venue Profile Page (`/venues/[slug]`)
- [x] Phase 5: Admin Venue Management
- [ ] Phase 6: Event Form Integration
- [ ] Phase 7: Translation Support
- [x] Phase 8: UI Translations (12 locales)
- [ ] Phase 9: Polish & Delight

---

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     VENUES      │         │     EVENTS      │         │   ORGANIZERS    │
│     (WHERE)     │◄────────│     (WHAT)      │────────►│     (WHO)       │
├─────────────────┤ venue_id├─────────────────┤organizer├─────────────────┤
│ Phố Bên Đồi     │         │ Jazz Night      │   _id   │ DL Jazz Club    │
│ Maze Bar        │         │ Art Workshop    │         │ Ward 1 Committee│
│ XQ Gallery      │         │ Coffee Meetup   │         │ The Married Bean│
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

**Key insight**: A venue is a persistent physical place. Events happen AT venues, run BY organizers.

---

## Phase 0: Data Migration Strategy

**Goal**: Audit existing data and plan migration for any organizers that are actually venues.

### Tasks

1. **Query existing organizers with type 'venue'**:
```sql
SELECT id, slug, name, description, logo_url
FROM organizers
WHERE organizer_type = 'venue';
```

2. **Document findings** in a comment at top of migration file

3. **Plan**: These will need manual lat/lng enrichment before migration. For now, create the venues table and handle migration separately.

### Deliverable
- Document in migration file header which organizers need migration
- Note that lat/lng will need to be added manually (or via Google Places API later)

---

## Phase 1: Database & Types

**Goal**: Create venues table, update events table, create RPC functions, update TypeScript types.

### 1.1 Migration File

Create `supabase/migrations/[timestamp]_venues.sql`:

```sql
-- ============================================
-- VENUES TABLE
-- Physical locations where events are held
-- ============================================

-- Audit note: Check organizers with type='venue' for potential migration
-- SELECT * FROM organizers WHERE organizer_type = 'venue';

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,

  -- Venue type (what kind of place)
  venue_type text CHECK (venue_type IN (
    'cafe', 'bar', 'restaurant', 'gallery', 'park', 'hotel',
    'coworking', 'community_center', 'outdoor', 'homestay', 'other'
  )),

  -- Location (required for venues - this is the key differentiator)
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text,
  google_maps_url text,
  google_place_id text,

  -- Contact
  website_url text,
  facebook_url text,
  instagram_url text,
  zalo_url text,
  phone text,
  email text,

  -- Operating hours (JSON)
  operating_hours jsonb,

  -- Amenities
  has_wifi boolean DEFAULT false,
  has_parking boolean DEFAULT false,
  has_outdoor_seating boolean DEFAULT false,
  is_pet_friendly boolean DEFAULT false,
  is_wheelchair_accessible boolean DEFAULT false,

  -- Enhanced fields for elite experience
  capacity int,
  price_range text CHECK (price_range IN ('$', '$$', '$$$', '$$$$')),
  tags text[] DEFAULT '{}',
  cuisine_types text[] DEFAULT '{}',
  photos jsonb DEFAULT '[]', -- [{url, caption, sort_order}]

  -- Media
  logo_url text,
  cover_photo_url text,

  -- Ownership & verification
  owner_id uuid REFERENCES profiles(id),
  is_verified boolean DEFAULT false,
  priority_score int DEFAULT 0,

  -- Analytics (updated by triggers/cron)
  total_events_hosted int DEFAULT 0,
  last_event_at timestamptz,

  -- Translation tracking
  source_locale text DEFAULT 'en',

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for performance
CREATE INDEX idx_venues_coordinates ON venues USING gist (
  ll_to_earth(latitude, longitude)
);
CREATE INDEX idx_venues_slug ON venues(slug);
CREATE INDEX idx_venues_type ON venues(venue_type);
CREATE INDEX idx_venues_owner ON venues(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_venues_verified ON venues(is_verified) WHERE is_verified = true;

-- ============================================
-- UPDATE EVENTS TABLE
-- Add venue_id foreign key
-- ============================================

ALTER TABLE events ADD COLUMN venue_id uuid REFERENCES venues(id);
CREATE INDEX idx_events_venue ON events(venue_id) WHERE venue_id IS NOT NULL;

-- ============================================
-- UPDATE TRANSLATION CONSTRAINTS
-- Add 'venue' to allowed content types
-- ============================================

ALTER TABLE content_translations
DROP CONSTRAINT IF EXISTS content_translations_content_type_check;

ALTER TABLE content_translations
ADD CONSTRAINT content_translations_content_type_check
CHECK (content_type IN ('event', 'moment', 'profile', 'blog', 'venue'));

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get venues for map display with event activity
CREATE OR REPLACE FUNCTION get_venues_for_map(
  p_types text[] DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  is_verified boolean,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.latitude, v.longitude, v.logo_url, v.is_verified,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now()
      AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (e2.ends_at IS NULL OR e2.ends_at > now())
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_types IS NULL OR v.venue_type = ANY(p_types))
  GROUP BY v.id
  ORDER BY has_happening_now DESC, upcoming_event_count DESC, v.priority_score DESC
  LIMIT p_limit;
$$;

-- Get venue by slug with all related data
CREATE OR REPLACE FUNCTION get_venue_by_slug(p_slug text)
RETURNS json
LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'venue', row_to_json(v),
    'upcoming_events', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'capacity', e.capacity
        ) ORDER BY e.starts_at
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at > now()
      LIMIT 10
    ),
    'happening_now', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'image_url', e.image_url,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at
        )
      ), '[]'::json)
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
    ),
    'past_events_count', (
      SELECT COUNT(*)::int
      FROM events e
      WHERE e.venue_id = v.id
      AND e.status = 'published'
      AND COALESCE(e.ends_at, e.starts_at + interval '4 hours') < now()
    ),
    'recent_activity', json_build_object(
      'events_this_month', (
        SELECT COUNT(*)::int FROM events
        WHERE venue_id = v.id
        AND status = 'published'
        AND starts_at > now() - interval '30 days'
      ),
      'total_visitors', (
        SELECT COALESCE(SUM(ec.going_spots), 0)::int
        FROM event_counts ec
        JOIN events e ON e.id = ec.event_id
        WHERE e.venue_id = v.id
        AND e.starts_at > now() - interval '90 days'
      )
    )
  )
  FROM venues v
  WHERE v.slug = p_slug;
$$;

-- Get venues for discovery page (with filtering)
CREATE OR REPLACE FUNCTION get_venues_for_discovery(
  p_type text DEFAULT NULL,
  p_open_now boolean DEFAULT false,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  venue_type text,
  logo_url text,
  cover_photo_url text,
  address text,
  is_verified boolean,
  price_range text,
  tags text[],
  operating_hours jsonb,
  upcoming_event_count bigint,
  has_happening_now boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.id, v.slug, v.name, v.venue_type,
    v.logo_url, v.cover_photo_url, v.address,
    v.is_verified, v.price_range, v.tags, v.operating_hours,
    COUNT(e.id) FILTER (
      WHERE e.starts_at > now() AND e.status = 'published'
    ) as upcoming_event_count,
    EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.venue_id = v.id
      AND e2.status = 'published'
      AND e2.starts_at <= now()
      AND (e2.ends_at IS NULL OR e2.ends_at > now())
    ) as has_happening_now
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
  WHERE (p_type IS NULL OR v.venue_type = p_type)
  GROUP BY v.id
  ORDER BY
    has_happening_now DESC,
    upcoming_event_count DESC,
    v.priority_score DESC,
    v.is_verified DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Venues are viewable by everyone"
  ON venues FOR SELECT
  USING (true);

-- Admin/owner write access
CREATE POLICY "Admins can manage all venues"
  ON venues FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Owners can update their venues"
  ON venues FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-media', 'venue-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Venue media is publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'venue-media');

CREATE POLICY "Admins can upload venue media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'venue-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'organizer_verified')
    )
  );
```

### 1.2 TypeScript Types

Update `lib/types/index.ts`:

```typescript
// Venue types
export type VenueType =
  | 'cafe'
  | 'bar'
  | 'restaurant'
  | 'gallery'
  | 'park'
  | 'hotel'
  | 'coworking'
  | 'community_center'
  | 'outdoor'
  | 'homestay'
  | 'other';

export interface OperatingHours {
  monday?: { open: string; close: string } | 'closed';
  tuesday?: { open: string; close: string } | 'closed';
  wednesday?: { open: string; close: string } | 'closed';
  thursday?: { open: string; close: string } | 'closed';
  friday?: { open: string; close: string } | 'closed';
  saturday?: { open: string; close: string } | 'closed';
  sunday?: { open: string; close: string } | 'closed';
}

export interface VenuePhoto {
  url: string;
  caption?: string;
  sort_order: number;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  venue_type: VenueType | null;

  // Location (required)
  latitude: number;
  longitude: number;
  address: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;

  // Contact
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  zalo_url: string | null;
  phone: string | null;
  email: string | null;

  // Details
  operating_hours: OperatingHours | null;
  has_wifi: boolean;
  has_parking: boolean;
  has_outdoor_seating: boolean;
  is_pet_friendly: boolean;
  is_wheelchair_accessible: boolean;

  // Enhanced
  capacity: number | null;
  price_range: '$' | '$$' | '$$$' | '$$$$' | null;
  tags: string[];
  cuisine_types: string[];
  photos: VenuePhoto[];

  // Media
  logo_url: string | null;
  cover_photo_url: string | null;

  // Meta
  owner_id: string | null;
  is_verified: boolean;
  priority_score: number;
  total_events_hosted: number;
  last_event_at: string | null;
  source_locale: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Joined data
  profiles?: Profile;
}

// Update Event interface - add venue_id
// In the Event interface, add:
//   venue_id: string | null;
//   venues?: Venue;

// Update TranslationContentType
// Change to: 'event' | 'moment' | 'profile' | 'blog' | 'venue'

// Venue for map display (minimal data)
export interface VenueMapMarker {
  id: string;
  slug: string;
  name: string;
  venue_type: string | null;
  latitude: number;
  longitude: number;
  logo_url: string | null;
  is_verified: boolean;
  upcoming_event_count: number;
  has_happening_now: boolean;
}

// Venue for discovery list
export interface VenueListItem {
  id: string;
  slug: string;
  name: string;
  venue_type: string | null;
  logo_url: string | null;
  cover_photo_url: string | null;
  address: string | null;
  is_verified: boolean;
  price_range: string | null;
  tags: string[];
  operating_hours: OperatingHours | null;
  upcoming_event_count: number;
  has_happening_now: boolean;
}
```

### 1.3 Constants File

Create `lib/constants/venue-types.ts`:

```typescript
import {
  Coffee,
  Wine,
  UtensilsCrossed,
  Palette,
  TreePine,
  Building2,
  Laptop,
  Users,
  Sun,
  Home,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { VenueType } from "@/lib/types";

export const VENUE_TYPE_CONFIG: Record<
  VenueType,
  {
    icon: LucideIcon;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  cafe: {
    icon: Coffee,
    label: "Cafe",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  bar: {
    icon: Wine,
    label: "Bar",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  restaurant: {
    icon: UtensilsCrossed,
    label: "Restaurant",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  gallery: {
    icon: Palette,
    label: "Gallery",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
  },
  park: {
    icon: TreePine,
    label: "Park",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  hotel: {
    icon: Building2,
    label: "Hotel",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  coworking: {
    icon: Laptop,
    label: "Coworking",
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
  },
  community_center: {
    icon: Users,
    label: "Community Center",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
  },
  outdoor: {
    icon: Sun,
    label: "Outdoor",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  homestay: {
    icon: Home,
    label: "Homestay",
    color: "text-rose-600",
    bgColor: "bg-rose-100",
  },
  other: {
    icon: MapPin,
    label: "Other",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
};

export const VENUE_TYPES = Object.keys(VENUE_TYPE_CONFIG) as VenueType[];
```

### Deliverables for Phase 1
- [ ] Migration file created and tested locally
- [ ] TypeScript types added to `lib/types/index.ts`
- [ ] Constants file created at `lib/constants/venue-types.ts`
- [ ] Run `npx supabase db push` or apply migration
- [ ] Commit: "feat(venues): add database schema and types"

---

## Phase 2: Venues Discovery Page

**Goal**: Create `/venues` page for browsing venues.

### 2.1 Page Structure

Create `app/[locale]/venues/page.tsx`:

```
/venues
├─ Header with back button
├─ "Open Now" section (if any venues open)
├─ Filter chips (venue types)
├─ Venue grid/list
└─ Empty state if no venues
```

### 2.2 Components to Create

1. `components/venues/venue-card.tsx` - Card for venue list
2. `components/venues/venue-type-filter.tsx` - Type filter chips
3. `components/venues/venue-hours-badge.tsx` - Open/Closed badge

### 2.3 Key Patterns

- Use `createStaticClient()` with `unstable_cache` for ISR (per CLAUDE.md)
- Mobile-first responsive grid
- Haptic feedback on card tap
- Skeleton loading states

### Deliverables for Phase 2
- [ ] `/venues` page created
- [ ] VenueCard component
- [ ] Type filter working
- [ ] Open Now logic implemented
- [ ] Mobile responsive
- [ ] Commit: "feat(venues): add discovery page"

---

## Phase 3: Map Integration

**Goal**: Show venue markers on the map alongside event markers.

### 3.1 Update EventMap Component

Modify `components/map/event-map.tsx`:

1. Accept `venues` prop of type `VenueMapMarker[]`
2. Create venue marker element (building icon instead of calendar)
3. Implement marker deduplication:
   - Events WITH venue_id: don't create separate marker
   - Venue markers show badge with event count
   - Events WITHOUT venue_id: create event markers as before

### 3.2 New Components

1. `components/map/venue-marker.tsx` - Venue marker element
2. `components/map/venue-popup-card.tsx` - Popup when venue tapped

### 3.3 Marker Visual Design

```
VENUE MARKERS (building icon):
  ⚪ Gray = venue, no upcoming events
  🟢 Green + badge = has upcoming events (badge shows count)
  🔴 Red pulsing = event happening now at venue
```

### 3.4 Map Page Update

Update `app/[locale]/map/page.tsx`:
- Fetch venues via `get_venues_for_map()` RPC
- Pass to EventMap component

### Deliverables for Phase 3
- [ ] Venue markers on map
- [ ] Marker deduplication working
- [ ] Popup card on venue tap
- [ ] Haptic feedback
- [ ] Commit: "feat(venues): add map markers"

---

## Phase 4: Venue Profile Page

**Goal**: Create `/venues/[slug]` page.

### 4.1 Page Structure

```
/venues/[slug]
├─ Cover photo (aspect-[2/1])
├─ Logo + Name + Verified badge
├─ Type + Address + Open status
├─ Action buttons (Directions, Website, etc.)
├─ "Happening Now" section (if applicable)
├─ "Upcoming Events" section
├─ "About" section (description, amenities)
├─ "Hours" section (with today highlighted)
├─ Photos gallery (if photos exist)
├─ "Claim this venue" banner (if unclaimed)
└─ Past events count
```

### 4.2 Components to Create

1. `components/venues/venue-hero.tsx` - Cover + logo header
2. `components/venues/venue-happening-now.tsx` - Live event section
3. `components/venues/venue-events-section.tsx` - Upcoming events
4. `components/venues/venue-details.tsx` - About + amenities
5. `components/venues/venue-hours.tsx` - Operating hours display
6. `components/venues/venue-photos-gallery.tsx` - Swipeable photos
7. `components/venues/venue-claim-banner.tsx` - CTA for unclaimed

### 4.3 Key Features

- Use `get_venue_by_slug()` RPC for efficient data fetching
- ISR caching pattern (per CLAUDE.md)
- LocalBusiness structured data for SEO
- "Open Now" calculation based on operating_hours
- Haptic feedback on action buttons

### 4.4 Structured Data

Create `lib/structured-data/venue.ts`:
- Generate LocalBusiness schema
- Map venue_type to specific schema types

### Deliverables for Phase 4
- [ ] Venue profile page working
- [ ] All sections implemented
- [ ] Structured data added
- [ ] Mobile responsive
- [ ] Commit: "feat(venues): add profile page"

---

## Phase 5: Admin Venue Management

**Goal**: Full CRUD for venues in admin panel.

### 5.1 Pages to Create

1. `app/[locale]/admin/venues/page.tsx` - List all venues
2. `app/[locale]/admin/venues/new/page.tsx` - Create venue
3. `app/[locale]/admin/venues/[id]/edit/page.tsx` - Edit venue

### 5.2 Components

1. `components/admin/venue-form.tsx` - Create/edit form
2. `components/admin/venue-card.tsx` - Card for admin list
3. `components/admin/operating-hours-editor.tsx` - Hours picker

### 5.3 Form Fields

Reuse existing components where possible:
- PlaceAutocomplete from event form
- AIEnhanceTextarea for description
- Logo upload pattern from organizer form

### Deliverables for Phase 5
- [ ] Admin venues list page
- [ ] Create venue form
- [ ] Edit venue form
- [ ] Media upload working
- [ ] Commit: "feat(venues): add admin management"

---

## Phase 6: Event Form Integration

**Goal**: Add venue picker to event creation/edit.

### 6.1 Component

Create `components/events/venue-picker.tsx`:
- Searchable dropdown
- Shows venue name, type, address
- On select: auto-fill location fields from venue

### 6.2 Form Logic

In `components/events/event-form.tsx`:
- Add VenuePicker component
- When venue selected:
  - Set venue_id
  - Auto-fill lat, lng, address, location_name from venue
  - Show "Using venue location" indicator
- Allow clearing venue to use custom location

### Deliverables for Phase 6
- [ ] VenuePicker component
- [ ] Event form integration
- [ ] Location auto-fill working
- [ ] Commit: "feat(venues): add event venue picker"

---

## Phase 7: Translation Support

**Goal**: Enable translations for venue descriptions.

### 7.1 Already Done in Phase 1
- Translation constraint updated in migration

### 7.2 Trigger Translation

In venue form submit (admin):
```typescript
import { triggerTranslation } from "@/lib/translations-client";

// After save
if (description) {
  triggerTranslation("venue", venueId, [
    { field_name: "description", text: description },
  ]);
}
```

### 7.3 Fetch Translations

On venue profile page:
```typescript
import { getTranslationsWithFallback } from "@/lib/translations";

const translations = await getTranslationsWithFallback(
  'venue',
  venue.id,
  locale,
  venue.source_locale || 'en',
  { description: venue.description }
);
```

### Deliverables for Phase 7
- [ ] Translation trigger in admin form
- [ ] Translation fetch on profile page
- [ ] Commit: "feat(venues): add translation support"

---

## Phase 8: UI Translations

**Goal**: Add venue-related strings to all 12 locale files.

### Files to Update

All files in `messages/`:
- en.json, vi.json, ko.json, zh.json, ru.json, fr.json
- ja.json, ms.json, th.json, de.json, es.json, id.json

### Keys to Add

```json
{
  "venues": {
    "title": "Venues",
    "viewVenue": "View Venue",
    "upcomingEvents": "Upcoming Events",
    "pastEvents": "Past Events",
    "noUpcomingEvents": "No upcoming events scheduled",
    "eventsHere": "{count} events here",
    "happeningNow": "Happening Now",
    "about": "About",
    "hours": "Hours",
    "openNow": "Open Now",
    "closedNow": "Closed",
    "openUntil": "Open until {time}",
    "opensAt": "Opens at {time}",
    "getDirections": "Get Directions",
    "claimVenue": "Claim this venue",
    "claimDescription": "Are you the owner? Claim this page to manage it.",
    "verified": "Verified",
    "recentActivity": "{count} people visited events here recently",
    "types": {
      "cafe": "Cafe",
      "bar": "Bar",
      "restaurant": "Restaurant",
      "gallery": "Gallery",
      "park": "Park",
      "hotel": "Hotel",
      "coworking": "Coworking",
      "community_center": "Community Center",
      "outdoor": "Outdoor",
      "homestay": "Homestay",
      "other": "Other"
    },
    "amenities": {
      "wifi": "WiFi",
      "parking": "Parking",
      "outdoorSeating": "Outdoor Seating",
      "petFriendly": "Pet Friendly",
      "wheelchair": "Wheelchair Accessible"
    },
    "priceRange": {
      "$": "Budget-friendly",
      "$$": "Moderate",
      "$$$": "Upscale",
      "$$$$": "Fine dining"
    }
  }
}
```

### Deliverables for Phase 8
- [ ] All 12 locale files updated
- [ ] No missing translation keys
- [ ] Commit: "feat(venues): add UI translations"

---

## Phase 9: Polish & Delight

**Goal**: Make it feel elite.

### 9.1 Skeleton Loaders

Add loading skeletons for:
- Venue cards
- Venue profile page
- Map popup card

### 9.2 Haptic Feedback Audit

Ensure haptics on:
- Venue marker tap
- "Get Directions" tap
- Action button taps
- Card taps

### 9.3 Animations

- Smooth transitions between states
- "Happening Now" subtle pulse animation
- Card hover/active states

### 9.4 Mobile Touch Targets

Verify all interactive elements are 44x44px minimum.

### 9.5 Empty States

Create delightful empty states:
- "No venues found" with helpful message
- "No events at this venue" with suggestion

### 9.6 Error Handling

- Graceful fallbacks
- Retry mechanisms
- User-friendly error messages

### Deliverables for Phase 9
- [ ] Skeleton loaders added
- [ ] Haptic feedback complete
- [ ] Animations polished
- [ ] Touch targets verified
- [ ] Empty states created
- [ ] Commit: "feat(venues): polish and delight"
- [ ] Final commit: "feat(venues): complete venues feature"

---

## Verification Checklist

Before outputting the completion promise, verify:

### Database
- [ ] Migration runs without errors
- [ ] RLS policies work correctly
- [ ] RPC functions return expected data

### Discovery Page
- [ ] `/venues` loads and shows venues
- [ ] Type filtering works
- [ ] Mobile responsive

### Map
- [ ] Venue markers appear
- [ ] Event deduplication working
- [ ] Popup cards functional

### Profile Page
- [ ] `/venues/[slug]` loads correctly
- [ ] All sections display
- [ ] Structured data present

### Admin
- [ ] Can create venues
- [ ] Can edit venues
- [ ] Media upload works

### Events
- [ ] Can select venue in event form
- [ ] Location auto-fills

### Translations
- [ ] All 12 locales have venue keys
- [ ] Content translations trigger

### Polish
- [ ] No console errors
- [ ] Mobile feels smooth
- [ ] Haptics working

---

## Completion

When ALL phases are complete and verified:

```
<promise>VENUES FEATURE COMPLETE</promise>
```

---

## Notes for the AI

1. **Read CLAUDE.md first** - It has critical patterns (ISR, mobile-first, translations)
2. **Commit after each phase** - Don't batch commits
3. **Test as you go** - Run the dev server, check the UI
4. **Follow existing patterns** - Look at organizers page for reference
5. **Mobile first** - Test on mobile viewport
6. **No shortcuts** - Complete each phase fully before moving on
