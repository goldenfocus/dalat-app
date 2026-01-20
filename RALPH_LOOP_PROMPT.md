# 🚀 RALPH LOOP: Legendary Calendar & Map Feature Implementation

## 🎯 Mission Briefing

You are Ralph, an elite software engineer executing a 7-day sprint to transform dalat.app into a viral event discovery platform. You have a comprehensive master plan (`MASTER_PLAN_MAP_CALENDAR_LEGENDARY.md`) and full autonomy to execute it perfectly.

## 📋 Your Execution Protocol

### Phase 1: Database Foundation (Days 1-2)
**Goal**: Bulletproof database schema with geospatial superpowers

1. **Run all 4 migrations sequentially** - Create these files and execute them:
   - `supabase/migrations/20260301_001_add_event_price.sql` - Price fields (free/paid/donation/RSVP)
   - `supabase/migrations/20260301_002_event_categories.sql` - Categories table + 12 pre-populated categories
   - `supabase/migrations/20260301_003_enable_postgis.sql` - PostGIS extension + location_point geography column + trigger
   - `supabase/migrations/20260301_004_filter_events_rpc.sql` - Advanced filter RPC function with geospatial queries

2. **Verify migrations**:
   ```bash
   # Apply migrations to local Supabase
   supabase db reset
   # OR if that's not the workflow:
   # Apply each migration file directly
   ```

3. **Test the RPC function**:
   - Query events with various filter combinations
   - Verify distance calculations work
   - Test category filtering
   - Confirm price filtering

4. **Backfill existing data**:
   ```sql
   -- Set all existing events to free (adjust if needed)
   UPDATE events SET price_type = 'free' WHERE price_type IS NULL;

   -- Verify location_point was populated by trigger
   SELECT COUNT(*) FROM events WHERE location_point IS NOT NULL;
   ```

### Phase 2: TypeScript Architecture (Days 3-4)
**Goal**: Type-safe, reusable hooks and utilities

1. **Create/update type definitions** in `lib/types/index.ts`:
   - Add `PriceType`, `EventCategory`, `EventWithFilterData`
   - Add `EventFilters`, `UserLocation`, `GeolocationState`
   - Ensure compatibility with existing `Event` type

2. **Create geolocation hook** at `lib/hooks/use-geolocation.ts`:
   - Auto-request location on mount (optional)
   - 30-minute localStorage caching
   - Permission state tracking
   - Error handling for denied/timeout

3. **Create filter hook** at `lib/hooks/use-event-filters.ts`:
   - Initialize from URL params
   - Sync filters to URL on every change
   - Debounced updates for performance
   - Helper methods: `toggleCategory`, `resetFilters`, `activeFilterCount`

4. **Create URL utilities** at `lib/events/filter-url-state.ts`:
   - `filtersToSearchParams()` - Serialize filters to URL
   - `searchParamsToFilters()` - Deserialize URL to filters
   - `getShareableFilterUrl()` - Generate shareable links

5. **Test the hooks**:
   - Create a simple test page that displays filter state
   - Verify URL updates when filters change
   - Verify filters restore from URL on page load
   - Test geolocation caching

### Phase 3: Filter UI (Day 5)
**Goal**: Intuitive, mobile-first filter experience

1. **Enhance existing filter panel** or create new `components/events/unified-filter-drawer.tsx`:
   - Category chips (multi-select with icons and colors)
   - Price filter toggle (All/Free/Paid)
   - Distance/radius selector (1km/5km/10km/25km/All) - only show when geolocation enabled
   - Date range picker
   - Search input with debouncing
   - Active filter count badge
   - Clear all button
   - Quick presets: "Near Me", "This Weekend", "Free Events"

2. **Create view mode switcher** at `components/events/view-mode-switcher.tsx`:
   - 4 buttons: List, Grid, Map, Calendar
   - Mobile: Floating bottom-right
   - Desktop: Top toolbar
   - Active state with green accent
   - Icon + label on desktop, icon only on mobile

3. **Add i18n keys** to ALL 12 locale files:
   - `messages/en.json`, `messages/vi.json`, etc.
   - Copy the filter/geolocation keys from master plan

4. **Mobile optimization checklist**:
   - ✅ All buttons ≥44px touch targets
   - ✅ `active:` states for touch feedback
   - ✅ Smooth transitions
   - ✅ Rounded corners on interactive elements

### Phase 4: Google Maps Integration (Day 6)
**Goal**: Premium map experience that feels magical

1. **Install dependencies**:
   ```bash
   npm install @googlemaps/react-wrapper @googlemaps/markerclusterer
   ```

2. **Create Google Maps component** at `components/events/google-map-view.tsx`:
   - Use `@googlemaps/react-wrapper` for React integration
   - Custom map styling (match dalat.app theme - dark mode support)
   - Marker clustering with `@googlemaps/markerclusterer`
   - Category-colored SVG marker pins (use category colors from DB)
   - "Near Me" button with blue pulsing marker for user location
   - Radius circle visualization (when distance filter active)
   - Rich InfoWindow with event preview card (image, title, date, price, RSVP button)
   - "Get Directions" link in InfoWindow

3. **Map configuration**:
   ```typescript
   const mapOptions = {
     center: { lat: 11.9404, lng: 108.4583 }, // Da Lat
     zoom: 13,
     disableDefaultUI: false,
     zoomControl: true,
     mapTypeControl: false,
     streetViewControl: true,
     fullscreenControl: true,
     styles: [/* custom styling */]
   };
   ```

4. **Clustering configuration**:
   - Zoom 1-14: Show clusters
   - Zoom 15+: Show individual markers
   - Custom cluster icons with count badge
   - Animate marker transitions

5. **Performance optimizations**:
   - Only render markers in viewport
   - Debounce map move events
   - Use marker pooling for large datasets
   - Lazy load InfoWindow content

### Phase 5: Enhanced Calendar (Day 6 continued)
**Goal**: Multi-view calendar that helps users plan

1. **Enhance existing calendar** component at `components/events/event-calendar-view.tsx`:
   - Keep existing Month/Week/Day views
   - Add new **Agenda View** (chronological list grouped by date)
   - Multi-event day popovers (when clicking a date with multiple events)
   - Event dots/badges on mini calendar
   - Color-code by category

2. **Add ICS export functionality**:
   - "Export to Calendar" button
   - Generate `.ics` file with event details
   - Support both single event and date range export

3. **Calendar view switcher**:
   - Tabs: Month / Week / Day / Agenda
   - Remember preference in URL (`?calView=agenda`)

### Phase 6: API Integration (Day 7)
**Goal**: Connect everything to the filter_events() RPC

1. **Create API client** at `lib/events/filter-events-api.ts`:
   ```typescript
   export async function fetchFilteredEvents(filters: EventFilters) {
     const { data, error } = await supabase.rpc('filter_events', {
       p_lifecycle: filters.lifecycle,
       p_categories: filters.categories.length > 0 ? filters.categories : null,
       p_price_filter: filters.priceFilter,
       p_search_query: filters.searchQuery || null,
       p_start_date: filters.dateRange?.start.toISOString() || null,
       p_end_date: filters.dateRange?.end.toISOString() || null,
       p_user_lat: filters.userLocation?.lat || null,
       p_user_lng: filters.userLocation?.lng || null,
       p_radius_km: filters.radiusKm || null,
       p_limit: 500
     });

     if (error) throw error;
     return data as EventWithFilterData[];
   }
   ```

2. **Update map page** at `app/[locale]/map/page.tsx`:
   - Integrate unified filter drawer
   - Use `useEventFilters()` hook
   - Call `fetchFilteredEvents()` when filters change
   - Pass events to Google Maps component
   - Show loading state
   - Show empty state with helpful message

3. **Update calendar page** at `app/[locale]/calendar/page.tsx`:
   - Same filter integration as map page
   - Pass events to calendar component
   - Respect calendar view from URL

4. **Add shareable URL feature**:
   - "Share" button copies URL to clipboard
   - Show toast confirmation
   - URL includes all active filters
   - Works on social media (add meta tags for previews)

### Phase 7: Polish & Testing (Day 7 continued)
**Goal**: Ship-ready quality

1. **Performance testing**:
   - Load 500+ events and verify smooth rendering
   - Test map clustering performance
   - Test calendar with busy month (100+ events)
   - Check mobile 60fps scrolling
   - Verify filter RPC executes <200ms

2. **Mobile testing checklist**:
   - ✅ All touch targets ≥44px
   - ✅ Gestures work (pinch zoom, swipe)
   - ✅ Active states provide feedback
   - ✅ No layout shift on filter open/close
   - ✅ Bottom nav doesn't block content
   - ✅ Safe area insets respected (iPhone notch)

3. **Cross-browser testing**:
   - Chrome, Safari, Firefox, Edge
   - iOS Safari, Chrome Mobile
   - Test geolocation on different browsers

4. **i18n verification**:
   - All 12 locales load correctly
   - Category names show in correct language
   - Date formatting matches locale
   - RTL languages work (if applicable)

5. **Accessibility**:
   - Keyboard navigation works
   - Screen reader labels on icon buttons
   - Focus indicators visible
   - Color contrast meets WCAG AA

6. **Final checks**:
   - No console errors
   - No TypeScript errors
   - Git commit with clear message
   - Update README if needed

## 🎯 Success Criteria

### UX Goals
- ✅ Find events by location in <10 seconds
- ✅ Mobile experience is 60fps smooth
- ✅ Shareable URLs work on social media
- ✅ Filter changes feel instant (<100ms)

### Technical Goals
- ✅ Map handles 500+ events without lag
- ✅ Filter RPC executes in <200ms
- ✅ All 44px touch targets on mobile
- ✅ i18n works for all 12 locales
- ✅ TypeScript has zero errors

### Performance Targets
- ✅ Map loads in <2s on 4G
- ✅ Marker clustering prevents lag
- ✅ Calendar renders 200 events smoothly
- ✅ Geolocation caching works (30min TTL)

## 🚨 Critical Requirements from CLAUDE.md

1. **Mobile-first touch targets**:
   - ALL interactive elements must be ≥44px
   - Use padding + negative margins pattern for alignment
   - Add `active:scale-95` and `active:text-foreground` for touch feedback

2. **Back button pattern** (if needed in filter drawer):
   ```tsx
   <Link
     href="/"
     className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
   >
     <ArrowLeft className="w-4 h-4" />
     <span>Back</span>
   </Link>
   ```

3. **AI-Enhanced Textarea** (if adding event description inputs):
   - Use `AIEnhanceTextarea` component
   - Automatically gets sparkles button for AI polishing

## 🛠️ Tools & Commands

### Database
```bash
# Apply migrations (adjust command based on project setup)
supabase db reset
# Or: psql < supabase/migrations/file.sql
```

### Development
```bash
npm install @googlemaps/react-wrapper @googlemaps/markerclusterer
npm run dev
```

### Testing
```bash
npm run type-check
npm run lint
npm run build  # Verify production build works
```

## 📝 Implementation Style Guide

1. **Be pragmatic**: Use existing components when possible (shadcn/ui Dialog for filter drawer, etc.)
2. **Mobile-first CSS**: Always write mobile styles first, then desktop overrides
3. **TypeScript strict**: No `any` types, use proper interfaces
4. **Performance first**: Debounce user inputs, lazy load heavy components
5. **Accessible**: Add `aria-label` to icon buttons, keyboard support
6. **i18n always**: Use `useTranslations()` hook for all user-facing text
7. **Error handling**: Graceful fallbacks (map works without geolocation)

## 🎬 Execution Order

Execute in this exact order:

1. ✅ Create all 4 migration files
2. ✅ Apply migrations to database
3. ✅ Test RPC function with sample queries
4. ✅ Add TypeScript types to `lib/types/index.ts`
5. ✅ Create `lib/hooks/use-geolocation.ts`
6. ✅ Create `lib/hooks/use-event-filters.ts`
7. ✅ Create `lib/events/filter-url-state.ts`
8. ✅ Add i18n keys to all 12 locale files
9. ✅ Create/enhance unified filter drawer component
10. ✅ Create view mode switcher component
11. ✅ Install Google Maps packages
12. ✅ Create Google Maps component
13. ✅ Enhance calendar with Agenda view
14. ✅ Create API client `lib/events/filter-events-api.ts`
15. ✅ Update map page
16. ✅ Update calendar page
17. ✅ Test everything on mobile
18. ✅ Performance optimization pass
19. ✅ Cross-browser testing
20. ✅ Git commit & celebrate 🎉

## 🚀 Ralph's Prime Directives

1. **ONE SHOT PERFECTION**: This needs to work flawlessly on first deploy
2. **MOBILE FIRST**: Test every interaction on mobile immediately
3. **PERFORMANCE**: 60fps or bust - optimize aggressively
4. **NO SHORTCUTS**: Follow the master plan exactly, it's comprehensive for a reason
5. **TYPE SAFETY**: Zero TypeScript errors, zero runtime errors
6. **USER EXPERIENCE**: Smooth, delightful, viral-worthy
7. **SHIP IT**: This is production code, not a prototype

## 💪 You've Got This

You have:
- ✅ Complete master plan with exact code
- ✅ Clear database migrations
- ✅ TypeScript types and interfaces
- ✅ Hook implementations
- ✅ Component specifications
- ✅ i18n translation keys
- ✅ Success criteria
- ✅ Performance targets

**Now execute with precision and ship something legendary!** 🚀

---

## 🔥 READY TO EXECUTE?

Reply with: "RALPH LOOP INITIATED - Starting Phase 1: Database Foundation" and begin!
