# Venue Mini-Website Enhancement - Master Plan

## Mission

Transform the venue detail page (`/venues/[slug]`) from a simple listing into a compelling "mini-website" that venue owners would want as their primary web presence.

**Success Criteria**: Pho Ben Doi owner sees the page and wants to use it as their website.

---

## Current State

- Basic venue page at `app/[locale]/venues/[slug]/page.tsx`
- Has: cover photo, logo, name, type, hours, amenities, upcoming events, contact info
- Missing: photo gallery, past events, map embed, section navigation, tags display

---

## Phases

Complete each phase fully before moving to the next. After completing a phase, verify it works, then continue to the next phase.

### Phase 1: Photo Gallery Component

**Goal**: Create a reusable photo gallery with lightbox for the `photos[]` array.

**Files to create/modify**:
- CREATE: `components/ui/photo-gallery.tsx` - Grid layout with lightbox
- MODIFY: `app/[locale]/venues/[slug]/page.tsx` - Add gallery section

**Requirements**:
- Masonry or responsive grid layout (2 cols mobile, 3 cols desktop)
- Click to open lightbox (full-screen view)
- Navigation arrows in lightbox
- Show caption if available
- Handle empty state gracefully (don't show section if no photos)

**Verification**:
- [ ] Component renders photos in grid
- [ ] Lightbox opens on click
- [ ] Can navigate between photos
- [ ] Empty array shows nothing (no broken section)

---

### Phase 2: Enhanced Hero Section

**Goal**: Make the cover photo area more dramatic and website-like.

**Files to modify**:
- MODIFY: `app/[locale]/venues/[slug]/page.tsx`

**Requirements**:
- Add gradient overlay on cover photo (bottom fade to black/dark)
- Move venue name/badges to overlay on the cover photo (not below)
- Larger, more prominent display
- "Verified Venue" badge more visible
- Keep mobile responsive

**Verification**:
- [ ] Gradient overlay visible on cover
- [ ] Text readable over image
- [ ] Looks good on mobile and desktop
- [ ] Falls back gracefully if no cover photo

---

### Phase 3: Section Navigation (Sticky Tabs)

**Goal**: Add website-style navigation to jump between sections.

**Files to create/modify**:
- CREATE: `components/venues/venue-section-nav.tsx` - Client component for sticky tabs
- MODIFY: `app/[locale]/venues/[slug]/page.tsx` - Add section IDs and nav

**Requirements**:
- Sticky tabs below header: Overview | Events | Gallery | Hours | Contact
- Smooth scroll to sections on click
- Only show tabs for sections that exist (e.g., no Gallery tab if no photos)
- Highlight active section on scroll (intersection observer)
- Mobile: horizontal scroll if needed

**Verification**:
- [ ] Tabs stick below header on scroll
- [ ] Clicking tab scrolls to section
- [ ] Active tab highlights correctly
- [ ] Hidden tabs for empty sections

---

### Phase 4: Past Events Archive

**Goal**: Show venue's event history, not just the count.

**Files to modify**:
- MODIFY: `lib/supabase/rpc/get_venue_by_slug.sql` (if exists) or create migration
- MODIFY: `app/[locale]/venues/[slug]/page.tsx`

**Requirements**:
- Fetch last 10-20 past events (title, date, image)
- Display in collapsible section "Past Events (N)"
- Show event cards similar to upcoming but with past styling
- Link to event pages

**Data needed**: Query events where `venue_id = venue.id AND ends_at < now()` ordered by `ends_at DESC`

**Verification**:
- [ ] Past events fetched and displayed
- [ ] Collapsible works
- [ ] Events link to their pages
- [ ] Shows count in header

---

### Phase 5: Interactive Map Embed

**Goal**: Show venue location on an interactive map.

**Files to modify**:
- MODIFY: `app/[locale]/venues/[slug]/page.tsx`

**Requirements**:
- Small map section showing venue pin
- Use existing Mapbox setup from the app
- Or fallback: static Google Maps embed
- "Open in Google Maps" button
- Aspect ratio ~16:9 or 2:1

**Check existing**: Look at `components/map/` for existing map components to reuse.

**Verification**:
- [ ] Map displays with venue marker
- [ ] Can interact (zoom/pan) or has link to full map
- [ ] Works on mobile

---

### Phase 6: Display Tags & Cuisine Types

**Goal**: Show the existing `tags[]` and `cuisine_types[]` data.

**Files to modify**:
- MODIFY: `app/[locale]/venues/[slug]/page.tsx`

**Requirements**:
- Display tags as pills/badges below description
- Display cuisine types for restaurants/cafes
- Style consistent with existing amenity badges
- Only show if data exists

**Verification**:
- [ ] Tags displayed as badges
- [ ] Cuisine types displayed
- [ ] No empty sections if no data

---

### Phase 7: Contact Section Enhancement

**Goal**: Consolidate contact info into a proper "Contact" section.

**Files to modify**:
- MODIFY: `app/[locale]/venues/[slug]/page.tsx`

**Requirements**:
- Dedicated "Contact" section with ID for navigation
- Group: phone, email, website, social links
- Add contact form placeholder (future: actual form)
- Map embed should be in or near this section

**Verification**:
- [ ] Contact section has clear heading
- [ ] All contact methods grouped
- [ ] Section ID works with nav tabs

---

### Phase 8: Visual Polish & Mobile Testing

**Goal**: Final polish pass for professional appearance.

**Files to modify**:
- Various CSS/styling adjustments

**Requirements**:
- Consistent spacing throughout
- All touch targets 44px minimum
- Test on mobile viewport (375px width)
- Dark mode looks good
- Page load performance acceptable

**Verification**:
- [ ] Mobile layout works
- [ ] Dark mode works
- [ ] No visual glitches
- [ ] Page feels like a real website

---

## Database Note

The venue already has these fields that may not be fully utilized:
- `photos: VenuePhoto[]` - Array with url, caption, sort_order
- `tags: string[]` - General tags
- `cuisine_types: string[]` - For food venues
- `latitude, longitude` - For map

No schema changes needed for Phase 1-8.

---

## Translation Keys

If adding new UI text, add keys to ALL 12 locale files in `messages/`:
en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id

New keys likely needed:
- `venues.pastEvents`
- `venues.viewAllPhotos`
- `venues.contactUs`

---

## Important Guidelines

1. **Read before writing**: Always read existing files before modifying
2. **Mobile-first**: Design for mobile, enhance for desktop
3. **44px touch targets**: All interactive elements
4. **No middleware.ts**: Use proxy.ts for any request interception
5. **Translations**: Add to ALL 12 locale files before using keys
6. **Test as you go**: Verify each phase works before moving on

---

## Completion

When ALL phases are complete and verified:

1. Run the dev server and visually check `/venues/[any-slug]`
2. Test on mobile viewport
3. Test dark mode
4. Ensure no console errors

Then output:

```
<promise>VENUE WEBSITE COMPLETE</promise>
```

---

## File References

Key files:
- `app/[locale]/venues/[slug]/page.tsx` - Main venue page
- `components/venues/` - Venue-related components
- `lib/types/index.ts` - Venue type definitions (has photos, tags, etc.)
- `lib/constants/venue-types.ts` - Venue type config
- `messages/*.json` - Translation files (12 languages)

---

## Progress Tracker

Update this as you complete phases:

- [x] Phase 1: Photo Gallery Component
- [x] Phase 2: Enhanced Hero Section
- [x] Phase 3: Section Navigation
- [x] Phase 4: Past Events Archive
- [x] Phase 5: Interactive Map Embed
- [x] Phase 6: Display Tags & Cuisine Types
- [x] Phase 7: Contact Section Enhancement
- [x] Phase 8: Visual Polish & Mobile Testing

## Implementation Complete

All 8 phases have been implemented:

**Components created:**
- `components/ui/photo-gallery.tsx` - Photo gallery with lightbox navigation
- `components/venues/venue-section-nav.tsx` - Sticky section navigation tabs
- `components/venues/past-events-section.tsx` - Collapsible past events archive
- `components/venues/venue-map.tsx` - Static map with directions

**Features added to venue page:**
- Dramatic hero section with gradient overlay and venue info on cover photo
- Photo gallery with grid layout and full-screen lightbox
- Smooth-scrolling section navigation with active state
- Past events collapsible archive (last 12 events)
- Interactive map embed with directions
- Tags and cuisine types display
- Enhanced contact section with map integration

**Translation keys added to all 12 locales:**
- `photos`, `contact`, `cuisineTypes`, `viewOnMap`, `openInGoogleMaps`, `overview`, `gallery`
