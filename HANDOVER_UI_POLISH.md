# Handover: UI Polish - Categories, Map Styling, Navigation

## Branch
`g-c-2` (pushed to origin)

## What Was Done This Session

### 1. Event Categories - Multi-Select Dropdown
**Files:**
- `components/ui/multi-select.tsx` (NEW)
- `components/events/category-selector.tsx` (UPDATED)

Replaced the checkbox grid with a sleek multi-select dropdown:
- Pill-shaped selected items with remove (X) buttons
- Max 3 selections enforced
- Animated dropdown with checkboxes
- Mobile-friendly 44px touch targets
- Green accent colors matching app theme

**Usage:**
```tsx
<MultiSelect
    options={[{ value: "music", label: "Music", icon: "🎵" }]}
    selected={selectedCategories}
    onChange={setSelectedCategories}
    placeholder="Select up to 3 categories"
    maxSelections={3}
/>
```

### 2. Google Maps Custom Styling
**File:** `components/map/adapters/google-maps-adapter.tsx`

Complete visual overhaul of the map:

**Map Theme:**
- Soft cream/grey background (`#f5f5f5`)
- Blue-grey water (`#c9d6df`)
- Soft green parks (`#e5f4e3`)
- Clean white roads
- Hidden POI labels (except parks)
- Subtle administrative boundaries

**Markers:**
- Modern pill-shaped design with calendar icon
- Smooth hover animations (scale 1.1)
- Elegant shadows with green glow
- White border for visibility

**Clusters:**
- Gradient background (green-500 to green-600)
- Hover scale effect
- 44px touch target

**Near Me Button:**
- Pill-shaped floating action button
- Blue location icon
- Hover shadow effect

### 3. Category Filtering Implementation
**Files:**
- `app/[locale]/explore/page.tsx`
- `components/explore/explore-view.tsx`

Fixed category filtering that wasn't working:
- Changed type from `Event[]` to `EventWithFilterData[]`
- Added fallback query to fetch `category_ids` when RPC unavailable
- Updated filter logic to use typed `category_ids` field
- Price filter now uses `price_type` field

### 4. Desktop Navigation Cleanup
**Files:**
- `components/site-header.tsx`
- `components/navigation/bottom-nav.tsx`

Removed redundant "+ Events" button from header:
- Deleted the standalone button from `SiteHeader`
- Integrated "Add Event" button into `TopNavBar` component
- Now displays as green pill-shaped CTA next to nav pills
- Cleaner, less cluttered header design

---

## Architecture: Category Filtering Flow

```
┌─────────────────────────────────────────────────────────────┐
│  /explore page                                               │
│  └── getEvents()                                            │
│      ├── Try filter_events RPC (includes category_ids)      │
│      └── Fallback: get_events_by_lifecycle + fetch          │
│          category_assignments manually                       │
│                                                              │
│  ExploreView receives EventWithFilterData[]                 │
│  └── filteredEvents = useMemo(() => {                       │
│      ├── Search filter (title, location, description)       │
│      ├── Date range filter                                  │
│      ├── Category filter (event.category_ids)               │
│      └── Price filter (event.price_type)                    │
│  })                                                         │
│                                                              │
│  FilterPanel                                                 │
│  └── Category checkboxes (12 categories)                    │
│  └── onApplyFilters → updates ExploreView state             │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Modified This Session

```
components/ui/multi-select.tsx              # NEW - Reusable multi-select dropdown
components/events/category-selector.tsx     # Refactored to use MultiSelect
components/map/adapters/google-maps-adapter.tsx  # Custom map styling + markers
components/explore/explore-view.tsx         # Fixed category filtering types
app/[locale]/explore/page.tsx               # Added category_ids to fallback
components/site-header.tsx                  # Removed redundant +Event button
components/navigation/bottom-nav.tsx        # Added Add Event to TopNavBar
```

---

## Key Code Snippets

### Multi-Select Component
```tsx
// components/ui/multi-select.tsx
export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder,
    maxSelections,
}: MultiSelectProps) {
    // Dropdown with checkboxes
    // Pills for selected items
    // Max selection enforcement
}
```

### Map Styling (excerpt)
```typescript
const MAP_STYLES: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9d6df" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e5f4e3" }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    // ... more styles
];
```

### Desktop TopNavBar with Add Button
```tsx
export function TopNavBar() {
    return (
        <nav className="hidden lg:flex items-center gap-3">
            {/* Navigation pills */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
                {navItems.map((item) => (
                    <Link ... />
                ))}
            </div>
            {/* Add Event button */}
            <Link href="/events/new" className="... bg-green-600 ...">
                <Plus /> Add Event
            </Link>
        </nav>
    );
}
```

---

## Testing Checklist

- [ ] Visit `/en/events/new` - category dropdown should show
- [ ] Select 3 categories - should prevent selecting more
- [ ] Remove a category by clicking X on the pill
- [ ] Visit `/en/explore` - map should have custom styling
- [ ] Hover over map markers - should scale up smoothly
- [ ] Click "Filters" button - select categories and apply
- [ ] Filtered events should update on map/calendar
- [ ] Desktop: "Add Event" button should be in the nav bar
- [ ] Mobile: Bottom nav should have floating green + button

---

## Testing URLs

- Home: http://localhost:3001/en
- Explore (Map): http://localhost:3001/en/explore
- Create Event: http://localhost:3001/en/events/new
- Desktop view: Resize browser to >1024px width

---

## Known Issues / Considerations

1. **Map ID Required**: The custom map styling uses `mapId: "dalat-events-map"`. If markers don't appear, ensure the Map ID is configured in Google Cloud Console.

2. **Category RPC**: If `filter_events` RPC doesn't exist, the fallback query manually joins categories. This is less efficient but works.

3. **Price Type Default**: Fallback events default to `price_type: "free"` since the old RPC doesn't include pricing info.

---

## Git Info

```
Branch: g-c-2
Last commit: feat: improve UI/UX for categories, map styling, and navigation
Remote: origin/g-c-2 (pushed)
```

---

## Next Steps (Optional Improvements)

1. **Dark mode map**: Add alternate map styles for dark mode
2. **Category icons in filter panel**: Show emoji icons next to filter checkboxes
3. **Animated markers**: Add subtle bounce animation when marker appears
4. **Map legend**: Show what the green markers represent
5. **Search in dropdown**: Add search/filter within the category dropdown for faster selection
