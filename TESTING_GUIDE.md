# Testing Guide: Calendar & Map Features

**Last Updated:** 2026-01-20

This guide walks you through testing all implemented features step-by-step.

---

## 🎯 Pre-Testing Setup

### 1. Verify Your Branch

```bash
# Check current branch
git branch

# Should show: working-ui-1 (with changes) or main (clean)
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## 📍 Test Group 1: Map Features (No API Key Needed)

### Test 1.1: Basic Map Display

**URL:** `/map`

**Steps:**
1. Navigate to `/map`
2. Verify Leaflet map loads (default provider)
3. Check that event markers appear on the map
4. Verify map controls (zoom in/out, pan)

**Expected Results:**
- ✅ Map displays without errors
- ✅ Multiple event markers visible
- ✅ Zoom/pan controls work smoothly

**Troubleshooting:**
- If map doesn't load: Check browser console for errors
- If no markers: Verify events exist in database

### Test 1.2: Marker Clustering (Leaflet)

**URL:** `/map`

**Steps:**
1. Zoom out to city/country level
2. Observe markers cluster into groups
3. Click on a cluster
4. Verify map zooms in and cluster splits

**Expected Results:**
- ✅ Markers cluster at low zoom levels
- ✅ Cluster numbers show event count
- ✅ Clicking cluster zooms and splits it

### Test 1.3: Event Details Popup

**URL:** `/map`

**Steps:**
1. Click on an individual event marker
2. Observe the InfoWindow/popup
3. Check content: image, title, date, location
4. Click "View Details" button
5. Verify redirects to event page

**Expected Results:**
- ✅ Popup opens with event details
- ✅ Event image displays correctly
- ✅ "View Details" redirects to `/events/[slug]`
- ✅ "Get Directions" opens external maps app

---

## 🗺️ Test Group 2: Google Maps (Requires API Key)

### Setup: Add Google Maps API Key

```bash
# Create/edit .env.local
echo "NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_api_key_here" >> .env.local
```

**Get API Key:** https://console.cloud.google.com/apis/credentials

**Required APIs:**
- Maps JavaScript API
- (Optional) Geocoding API

### Test 2.1: Switch to Google Maps

**File:** [components/map/map-landing-page.tsx](components/map/map-landing-page.tsx)

**Steps:**
1. Open `components/map/map-landing-page.tsx`
2. Find line ~109: `<UnifiedMap provider="leaflet" ...>`
3. Change to: `<UnifiedMap provider="google" ...>`
4. Save and refresh `/map` page

**Expected Results:**
- ✅ Google Maps loads instead of Leaflet
- ✅ Custom green markers appear
- ✅ No console errors

### Test 2.2: Advanced Marker Interactions

**URL:** `/map` (with Google provider)

**Steps:**
1. Hover over a marker → should scale up
2. Click a marker → should show InfoWindow
3. Click different marker → InfoWindow moves
4. Verify InfoWindow content matches event

**Expected Results:**
- ✅ Markers scale on hover (visual feedback)
- ✅ InfoWindow displays rich content
- ✅ Only one InfoWindow open at a time

### Test 2.3: MarkerClusterer (Google)

**URL:** `/map` (with Google provider)

**Steps:**
1. Zoom out to country level
2. Observe green circular cluster badges
3. Click a cluster → zooms in
4. Continue zooming until individual markers appear
5. Verify clusters disappear at zoom 15+

**Expected Results:**
- ✅ SuperCluster algorithm creates clusters
- ✅ Green circular badges with event count
- ✅ Clusters split at zoom 15+
- ✅ No lag with 500+ events

---

## 📍 Test Group 3: Geolocation

### Test 3.1: "Near Me" Button

**URL:** `/map`

**Steps:**
1. Click "Near Me" button (target icon)
2. Browser prompts for location permission
3. Click "Allow"
4. Wait for map to recenter
5. Observe pulsing blue marker at your location

**Expected Results:**
- ✅ Permission prompt appears
- ✅ Map centers on user location (zoom 14)
- ✅ Blue pulsing marker shows user position
- ✅ Location cached for 30 minutes

**Troubleshooting:**
- If permission denied: Check browser settings
- If location inaccurate: GPS signal may be weak
- To reset: Clear localStorage and try again

### Test 3.2: Distance Filter

**URL:** `/map`

**Steps:**
1. Enable geolocation ("Near Me")
2. Open filter panel (filter icon)
3. Scroll to "Distance" section
4. Select radius: 1km, 5km, 10km, 25km
5. Observe radius circle on map (Google Maps only)
6. Verify events outside radius are hidden

**Expected Results:**
- ✅ Distance selector shows after geolocation
- ✅ Radius circle appears on Google Maps
- ✅ Events filtered by distance (client-side)
- ✅ Event count updates

**Note:** Server-side PostGIS filtering requires database migrations.

---

## 🔍 Test Group 4: Filters

### Test 4.1: Search Filter

**URL:** `/map` or `/calendar`

**Steps:**
1. Open filter panel
2. Type "coffee" in search box
3. Observe filtered results
4. Clear search → all events return

**Expected Results:**
- ✅ Results filter by title/description
- ✅ Case-insensitive search
- ✅ Instant filtering (no lag)

### Test 4.2: Date Range Filter

**URL:** `/map` or `/calendar`

**Steps:**
1. Open filter panel
2. Click "From" date picker → select today
3. Click "To" date picker → select 7 days from now
4. Observe filtered events
5. Check that events outside range are hidden

**Expected Results:**
- ✅ Date pickers work on mobile and desktop
- ✅ Events filtered to selected range
- ✅ Clearing dates shows all events

### Test 4.3: Price Filter (Requires Migrations)

**URL:** `/map` or `/calendar`

**Steps:**
1. Open filter panel
2. Select "Free" under Price
3. Observe only free events
4. Select "Paid" → only paid events
5. Select "All" → all events return

**Expected Results:**
- ⏳ Requires database migration to test
- ✅ Filter buttons toggle correctly
- ✅ Event count updates

### Test 4.4: Category Filter (Requires Migrations)

**URL:** `/map` or `/calendar`

**Steps:**
1. Open filter panel
2. Click category badges: Music, Food, Yoga, etc.
3. Observe filtered events
4. Select multiple categories
5. Verify events match ANY selected category

**Expected Results:**
- ⏳ Requires database migration to test
- ✅ Multiple selection works
- ✅ Badge visual feedback (selected state)
- ✅ Event count updates

---

## 🔗 Test Group 5: Shareable URLs

### Test 5.1: Copy Shareable URL

**URL:** `/map`

**Steps:**
1. Apply filters: search "music", select date range
2. Open filter panel
3. Click "Share" button
4. Verify "Copied!" toast appears
5. Paste URL in new browser tab
6. Verify filters are restored

**Expected Results:**
- ✅ "Copied!" feedback appears
- ✅ URL contains query params: `?q=music&from=...&to=...`
- ✅ New tab restores exact filter state
- ✅ Map view and filters match original

### Test 5.2: Shareable URL Format

**Expected URL Format:**
```
/map?lifecycle=upcoming&q=music&categories=music,food&price=free&from=2026-01-20&to=2026-01-27&radius=5&view=map
```

**Steps:**
1. Copy shareable URL
2. Paste into text editor
3. Verify query parameters match filters

**Expected Results:**
- ✅ URL is human-readable
- ✅ All active filters encoded
- ✅ No sensitive data in URL

---

## 📅 Test Group 6: Calendar

### Test 6.1: Calendar Views

**URL:** `/calendar`

**Steps:**
1. Navigate to `/calendar`
2. Verify Month view shows (default)
3. Click "Week" → verify week grid
4. Click "Day" → verify single day
5. Click "Agenda" → verify list view

**Expected Results:**
- ✅ All 4 views render correctly
- ✅ Navigation buttons work (prev/next month)
- ✅ Today button returns to current date
- ✅ Mobile: views adapt to small screens

### Test 6.2: Agenda View (Next 90 Days)

**URL:** `/calendar`

**Steps:**
1. Switch to "Agenda" view
2. Observe chronological list
3. Verify events from today → 90 days
4. Check date group headers
5. Click event → redirects to details

**Expected Results:**
- ✅ Events sorted by start date
- ✅ Date group headers (e.g., "Mon, Jan 20")
- ✅ Shows next 90 days of events
- ✅ No pagination needed

### Test 6.3: ICS Export (Single Event)

**URL:** `/events/[any-event-slug]`

**Steps:**
1. Navigate to any event detail page
2. Look for "Add to Calendar" button
3. Click button
4. Verify `[event-title].ics` downloads
5. Open ICS file in calendar app
6. Verify event imports correctly

**Expected Results:**
- ✅ ICS file downloads
- ✅ Compatible with Apple/Google/Outlook Calendar
- ✅ Event details match (title, date, location)
- ✅ Geo-coordinates included

### Test 6.4: Multi-Event ICS Export

**URL:** `/calendar`

**Steps:**
1. Switch to Month view
2. Click "Export" button (top right)
3. Verify `dalat-events-2026-01.ics` downloads
4. Open in calendar app
5. Verify all visible events import

**Expected Results:**
- ✅ Multi-event ICS downloads
- ✅ Filename includes year-month
- ✅ All events in current view included
- ✅ RFC 5545 compliant format

**Test in Agenda View:**
1. Switch to Agenda view
2. Click "Export" button
3. Verify exports next 90 days of events

---

## 🎨 Test Group 7: View Mode Switcher

### Test 7.1: Desktop View Switcher

**URL:** `/map` or `/calendar`

**Steps:**
1. Observe view switcher (top of page)
2. Verify 4 buttons: List, Grid, Map, Calendar
3. Click each button
4. Verify icon + label visible
5. Check active state highlighting

**Expected Results:**
- ✅ Desktop: buttons show icons + labels
- ✅ Active button highlighted
- ✅ Smooth transitions between views

### Test 7.2: Mobile View Switcher

**URL:** `/map` or `/calendar` (resize to mobile)

**Steps:**
1. Open DevTools → toggle device toolbar
2. Select mobile device (e.g., iPhone 12)
3. Observe view switcher
4. Verify icon-only buttons
5. Tap each button (44px touch target)

**Expected Results:**
- ✅ Mobile: icon-only buttons (no labels)
- ✅ Minimum 44px touch targets
- ✅ Active state visible
- ✅ No overlapping/crowding

---

## 🌍 Test Group 8: Internationalization (i18n)

### Test 8.1: Locale Switching

**URL:** `/en/map` → `/vi/map` → `/ja/map`

**Steps:**
1. Visit `/en/map` (English)
2. Change URL to `/vi/map` (Vietnamese)
3. Change URL to `/ja/map` (Japanese)
4. Verify filter labels translate
5. Check button text translates

**Expected Results:**
- ✅ 12 locales supported: en, vi, ja, ko, zh, th, ms, id, es, fr, de, ru
- ✅ Filter panel translates
- ✅ Date formats adapt to locale
- ✅ No missing translation warnings

**Supported Locales:**
- English (en)
- Vietnamese (vi)
- Japanese (ja)
- Korean (ko)
- Chinese (zh)
- Thai (th)
- Malay (ms)
- Indonesian (id)
- Spanish (es)
- French (fr)
- German (de)
- Russian (ru)

---

## 🔬 Test Group 9: Edge Cases

### Test 9.1: No Events Found

**Steps:**
1. Apply filters with no matching events
2. Verify empty state message
3. Check no map markers display

**Expected Results:**
- ✅ Friendly empty state message
- ✅ No errors in console
- ✅ Map still interactive

### Test 9.2: Geolocation Denied

**Steps:**
1. Click "Near Me" button
2. Click "Block" on permission prompt
3. Verify error message
4. Check map still works

**Expected Results:**
- ✅ Error toast: "Location permission denied"
- ✅ Distance filter remains hidden
- ✅ Map functionality unaffected

### Test 9.3: Slow Network

**Steps:**
1. Open DevTools → Network tab
2. Throttle to "Slow 3G"
3. Navigate to `/map`
4. Observe loading states

**Expected Results:**
- ✅ Loading skeletons display
- ✅ No layout shift when data loads
- ✅ Graceful error handling

### Test 9.4: 500+ Events

**Steps:**
1. Ensure database has 500+ events
2. Navigate to `/map`
3. Observe marker clustering
4. Check performance (no lag)

**Expected Results:**
- ✅ Clustering prevents marker overload
- ✅ Smooth zoom/pan (60fps)
- ✅ No browser freezing

---

## 🗄️ Test Group 10: Database Migrations (When Applied)

**Prerequisites:** Apply migrations from `supabase/migrations/APPLY_ALL_MIGRATIONS.sql`

### Test 10.1: Category Filter (Post-Migration)

**Steps:**
1. Navigate to `/map`
2. Open filter panel
3. Verify 12 category badges appear
4. Select "Music" → see music events only
5. Select "Food" → see food events only

**Expected Results:**
- ✅ Categories from `event_categories` table
- ✅ Multi-select works
- ✅ Events show category badges

**12 Categories:**
- Music, Food, Nightlife, Yoga, Community, Sports, Art, Workshop, Coffee, Nature, Education, Other

### Test 10.2: Price Filter (Post-Migration)

**Steps:**
1. Open filter panel
2. Select "Free" → see free events
3. Select "Paid" → see paid events
4. Verify event cards show price info

**Expected Results:**
- ✅ Events filtered by `price_type`
- ✅ Price displayed: "Free", "$10", "VND 200,000"
- ✅ Price notes shown (e.g., "Early bird")

### Test 10.3: PostGIS Distance Filter (Post-Migration)

**Steps:**
1. Enable geolocation
2. Select distance radius (5km)
3. Verify server-side filtering
4. Check events return `distance_km` field

**Expected Results:**
- ✅ `filter_events` RPC called (not fallback)
- ✅ Distance calculated server-side (PostGIS)
- ✅ Faster than client-side filtering
- ✅ Accurate distance measurements

---

## ✅ Final Checklist

### Before Migrations:
- [ ] Map displays with Leaflet
- [ ] Marker clustering works
- [ ] "Near Me" button requests location
- [ ] Client-side distance filtering works
- [ ] Calendar Agenda view shows events
- [ ] ICS export downloads valid file
- [ ] "Share" button copies URL
- [ ] Shareable URL restores filters
- [ ] View mode switcher works (4 modes)
- [ ] Touch targets are 44px (mobile)
- [ ] All 12 locales load correctly

### After Migrations:
- [ ] Category filter works (12 categories)
- [ ] Price filter works (free/paid/all)
- [ ] Server-side PostGIS distance filtering
- [ ] Events show category badges
- [ ] Events show price information
- [ ] `filter_events` RPC returns `distance_km`

---

## 🐛 Troubleshooting

### Issue: Map doesn't load

**Solution:**
1. Check browser console for errors
2. Verify `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `.env.local`
3. Check Google Maps API is enabled
4. Try fallback to Leaflet (default)

### Issue: Geolocation fails

**Solution:**
1. Check browser location permissions
2. Ensure HTTPS (required for geolocation)
3. Try desktop browser (mobile GPS may be disabled)
4. Clear localStorage and retry

### Issue: ICS export fails

**Solution:**
1. Check browser allows downloads
2. Verify events have valid dates
3. Check `lib/utils/ics-export.ts` for errors
4. Test with single event first

### Issue: Filters don't work

**Solution:**
1. Verify `filter_events` RPC exists (after migrations)
2. Check fallback to `get_events_by_lifecycle`
3. Inspect URL query params
4. Check `lib/events/filter-events-api.ts` logs

---

## 📊 Performance Benchmarks

### Expected Performance:
- **Map Load:** < 2 seconds (500 events)
- **Filter Update:** < 100ms (client-side)
- **Geolocation:** < 1 second (cached)
- **ICS Export:** < 500ms (100 events)
- **View Switch:** < 300ms (smooth transition)

### Measure Performance:
```javascript
// In browser console
performance.mark('filter-start');
// Apply filter
performance.mark('filter-end');
performance.measure('filter', 'filter-start', 'filter-end');
console.log(performance.getEntriesByName('filter'));
```

---

## 🎉 Success Criteria

Your implementation passes if:

1. ✅ All Test Groups 1-9 pass (before migrations)
2. ✅ No TypeScript errors (`npm run build`)
3. ✅ No console errors in browser
4. ✅ Mobile touch targets are 44px minimum
5. ✅ All 12 locales load without missing keys
6. ✅ Shareable URLs work across devices
7. ✅ ICS exports open in calendar apps
8. ✅ Test Group 10 passes (after migrations)

---

## 📝 Testing Report Template

```markdown
# Testing Report: Calendar & Map Features

**Tester:** [Your Name]
**Date:** 2026-01-20
**Branch:** working-ui-1
**Migrations Applied:** [ ] Yes [ ] No

## Test Results:

### Map Features:
- [ ] Basic map display
- [ ] Marker clustering
- [ ] Event popups
- [ ] Google Maps (if API key added)

### Geolocation:
- [ ] "Near Me" button
- [ ] Distance filter
- [ ] Radius visualization

### Filters:
- [ ] Search
- [ ] Date range
- [ ] Price (post-migration)
- [ ] Categories (post-migration)

### Calendar:
- [ ] All 4 views (Month/Week/Day/Agenda)
- [ ] ICS export (single)
- [ ] ICS export (multi-event)

### Shareable URLs:
- [ ] Copy to clipboard
- [ ] URL restores filters

### Mobile:
- [ ] 44px touch targets
- [ ] View switcher (icon-only)

### i18n:
- [ ] All 12 locales work
- [ ] No missing translations

## Issues Found:
[Describe any bugs/issues]

## Performance Notes:
[Any lag or slow loading?]

## Recommendations:
[Suggestions for improvement]
```

---

**Happy Testing! 🧪**

Need help? Check [HANDOVER.md](HANDOVER.md) or [MASTER_PLAN_MAP_CALENDAR_LEGENDARY.md](MASTER_PLAN_MAP_CALENDAR_LEGENDARY.md).
