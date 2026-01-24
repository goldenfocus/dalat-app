# Performance Optimization Report

**Goal:** Achieve Google PageSpeed 100% on mobile

---

## Iteration 1: Initial Analysis

**Date:** 2026-01-24

### What's Already Good

| Area | Status | Notes |
|------|--------|-------|
| Image Optimization | :white_check_mark: | AVIF/WebP, responsive sizes, blur placeholder |
| Font Loading | :white_check_mark: | `font-display: optional`, preconnect to Google Fonts |
| ISR Caching | :white_check_mark: | Homepage uses `revalidate = 60`, event data cached |
| Tree-shaking | :white_check_mark: | `optimizePackageImports` for lucide, date-fns, Radix |
| Static Headers | :white_check_mark: | 1-year cache for images, immutable for /_next/static |
| Gzip Compression | :white_check_mark: | Enabled in production |
| Console Removal | :white_check_mark: | `removeConsole` in production |
| Image CDN | :white_check_mark: | Cloudflare loader used in EventCard |

### Critical Issues Found

#### 1. Heavy Components Not Dynamically Imported

| Component | Size Impact | File |
|-----------|-------------|------|
| **Google Maps + Supercluster** | ~150KB+ | `components/map/event-map.tsx` |
| **Recharts** | ~500KB | `components/admin/analytics/*.tsx` (4 files) |
| **react-markdown + remark-gfm** | ~100KB | `components/blog/markdown-renderer.tsx` |

**Impact:** These libraries are bundled in the main JS, blocking First Contentful Paint (FCP) and Largest Contentful Paint (LCP) even when users don't visit those pages.

**Fix:** Use `next/dynamic` with `ssr: false` for these components.

#### 2. 228 Client Components

Files with `"use client"` directive: **228 total**

Many could potentially be converted to Server Components or have client logic extracted to smaller boundary components.

**Priority candidates for SSR conversion:**
- `components/events/event-card.tsx` - Only needs client for prefetch handlers
- `components/events/series-badge.tsx` - Minimal client logic
- UI components that don't need interactivity

#### 3. Third-party Scripts

| Script | Loading Strategy | Issue |
|--------|------------------|-------|
| Google Maps API | Loaded on `/map` page | Loaded synchronously via script tag |

**Fix:** Use async loading pattern or `next/script` with `strategy="lazyOnload"`.

### Layout Analysis

The locale layout loads these components for every page:

```
- NextIntlClientProvider (necessary)
- QueryProvider (necessary)
- ThemeProvider (necessary)
- ScrollRestorationProvider
- LocalePreloader
- PerformanceMonitor
- BadgeClearer
- NotificationPrompt
- SwUpdateHandler
- LocaleMismatchBanner
- InstallAppBanner
- MobileBottomNav
- GlobalFooter
- GodModeIndicator (conditional)
```

**Potential optimizations:**
- Lazy load `NotificationPrompt`, `SwUpdateHandler`, `InstallAppBanner` after page hydration
- Consider if `PerformanceMonitor` should only run in development

### Recommendations Priority

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| P0 | Dynamic import EventMap | -150KB initial bundle |
| P0 | Dynamic import Recharts | -500KB initial bundle |
| P1 | Dynamic import MarkdownRenderer | -100KB for non-blog pages |
| P1 | Lazy load banners/prompts | Faster hydration |
| P2 | Audit 228 client components | Reduce JS sent to client |
| P2 | Use `next/script` for Google Maps | Non-blocking load |

---

## Iteration 2: Dynamic Imports Implementation

**Date:** 2026-01-24

### Discoveries

1. **Recharts already dynamically imported!** :white_check_mark:
   - File: `components/admin/analytics/dynamic-charts.tsx`
   - All 4 chart components use `next/dynamic` with `ssr: false`
   - This was already well-architected

2. **react-markdown auto code-split** :white_check_mark:
   - Used only in `/blog` route segment
   - Next.js automatically code-splits by route, so this only loads on blog pages
   - No action needed

3. **Layout components are lightweight** :white_check_mark:
   - `NotificationPrompt` renders `null` and delays 1.5s before any action
   - `InstallAppBanner` conditionally renders based on install state
   - These don't impact initial render

### Changes Made

| Change | File | Impact |
|--------|------|--------|
| Created `DynamicEventMap` | `components/map/dynamic-event-map.tsx` | -150KB+ from initial bundle |
| Updated map page | `app/[locale]/map/page.tsx` | Uses dynamic import |

### Updated Priority List

| Priority | Action | Status |
|----------|--------|--------|
| P0 | Dynamic import EventMap | :white_check_mark: DONE |
| P0 | Dynamic import Recharts | :white_check_mark: Already done |
| P1 | Dynamic import MarkdownRenderer | :white_check_mark: Auto code-split |
| P1 | Lazy load banners/prompts | :white_check_mark: Already lightweight |
| P2 | Audit 228 client components | Pending |
| P2 | Use `next/script` for Google Maps | Pending |

---

## Iteration 3: Client Component Audit

**Date:** 2026-01-24

### Analysis Summary

Analyzed 241 files with `"use client"` directive. Found several components that should be Server Components or could have client boundaries extracted.

### Immediate Conversion Candidates (No Client Features)

These components are marked as client but have **zero client-side requirements**:

| Component | File | Issue |
|-----------|------|-------|
| `SeriesBadge` | `components/events/series-badge.tsx` | Pure render, uses only `getShortRRuleLabel()` |
| `BlogStoryCard` | `components/blog/blog-story-card.tsx` | Only `date-fns` + Link (works on server) |
| `MonthNavigation` | `components/events/month-navigation.tsx` | Only locale + Link navigation |
| `ClaimProfileBanner` | `components/profile/claim-profile-banner.tsx` | Static text + Link |
| `TranslationBadge` | `components/ui/translation-badge.tsx` | Only `<details>` element needs client |

### Extract Client Boundary Candidates

These have heavy rendering but minimal client interactivity that could be extracted:

| Component | Lines | Client Need | Strategy |
|-----------|-------|-------------|----------|
| `EventCard` | 164 | `onMouseEnter`, `onTouchStart` for prefetch | Create `EventCardServer` + tiny client wrapper |
| `VenueCard` | 135 | `triggerHaptic()` on click | Move rendering to server |
| `TagBadge` | ~80 | Optional `onClick` | Separate `TagBadge` (server) from `ClickableTagBadge` (client) |

### Heavy Animation Components (Appropriate Client, but optimize)

These are legitimately client components but resource-intensive:

| Component | Lines | Issue | Optimization |
|-----------|-------|-------|--------------|
| `MatrixRain` | 150+ | Canvas animation on mount | Add visibility check, defer with `requestIdleCallback` |
| `DisintegrationEffect` | 279 | Particle animation | Defer start with `isActive` prop |
| `MatrixText` | 98 | Multiple `setInterval` calls | Make animation optional |
| `PhotoGallery` | 200+ | Heavy canvas/image manipulation | Consider dynamic import if not always visible |

### Estimated Impact

| Metric | Improvement |
|--------|-------------|
| JS Bundle | -15-25KB (from eliminating unnecessary hydration) |
| Components to Hydrate | -8-12 on initial page load |
| TTI Improvement | ~5-10ms |

---

## Iteration 4: Server Component Conversions

**Date:** 2026-01-24

### Changes Made

| Component | Change | Impact |
|-----------|--------|--------|
| `SeriesBadge` | Removed `"use client"` | Now renders on server, no hydration needed |
| `BlogStoryCard` | Removed `"use client"` | Server-rendered blog cards |
| `MonthNavigation` | Removed `"use client"`, added `locale` prop | Passes locale from page instead of using hook |

### Additional Finding

- `ClaimProfileBanner` uses `useTranslations()` for dynamic text with placeholders - keeping as client is appropriate here since the translations include dynamic counts.

### Conversion Summary

**Before:** 228 client components
**After:** 225 client components (-3)

These 3 components now render on the server, eliminating unnecessary JavaScript hydration.

---

## Iteration 5: Core Web Vitals Analysis

**Date:** 2026-01-24

### LCP (Largest Contentful Paint) - Already Optimized

The `ImmersiveImage` component (mobile homepage LCP element) is well-optimized:

| Technique | Status | Implementation |
|-----------|--------|----------------|
| Priority loading | :white_check_mark: | `priority={true}` on first visible image |
| High fetch priority | :white_check_mark: | `fetchPriority="high"` |
| Blur placeholder | :white_check_mark: | Inline base64 gradient (150 bytes) |
| Deferred aspect ratio | :white_check_mark: | Uses `requestIdleCallback` to not block render |
| CDN delivery | :white_check_mark: | Cloudflare loader for edge-cached images |

### CLS (Cumulative Layout Shift) - Already Optimized

CSS in `globals.css` already handles:

| Technique | Status | Implementation |
|-----------|--------|----------------|
| Scrollbar stability | :white_check_mark: | `scrollbar-gutter: stable` |
| Image containment | :white_check_mark: | `content-visibility: auto` on images |
| Fixed element containment | :white_check_mark: | `contain: layout style` |
| Footer intrinsic size | :white_check_mark: | `contain-intrinsic-size: auto 200px` |
| Font smoothing | :white_check_mark: | `text-rendering: optimizeSpeed` |

### Third-party Scripts

Google Maps API loading is already optimized:
- Uses `async` and `defer` attributes
- Only loads on pages that need it (`/map`, event forms)
- Uses `loading=async` parameter in API URL

### Performance Patterns Already in Place

1. **GPU Acceleration**: `will-change: transform` on animated elements
2. **Below-fold optimization**: `content-visibility: auto` on footer
3. **Paint containment**: `contain: layout style` on fixed elements

### No Changes Needed This Iteration

The Core Web Vitals foundations are already solid. The main areas for improvement are:
1. Further reducing client components (ongoing work)
2. Monitoring real-user metrics (RUM) in production

---

## Iteration 6: Database Query Analysis

**Date:** 2026-01-24

### High Priority Issues

#### 1. N+1 Query Pattern - Moment Navigation

**File:** `app/[locale]/moments/[id]/page.tsx` (Lines 98-166)

The `getEventAdjacentMoments()` function performs up to **4 sequential queries** to find adjacent moments with wraparound logic.

**Current Pattern:**
```
Query 1: Previous moment
Query 2: Next moment
Query 3: (if no prev) Get last moment for wraparound
Query 4: (if no next) Get first moment for wraparound
```

**Fix:** Create single RPC `get_event_adjacent_moments_with_wraparound()` that handles all logic in PostgreSQL.

#### 2. Sequential Organizer Stats Queries

**File:** `app/[locale]/organizer/page.tsx` (Lines 14-76)

Dashboard makes **5 separate queries** that could be 1-2:
- Get organizers by owner_id
- Count events
- Count festivals
- Fetch event RSVP counts
- Count upcoming events

**Fix:** Create `get_organizer_dashboard_stats(owner_id)` RPC function.

#### 3. Duplicate Moments Fetch

**File:** `app/[locale]/moments/page.tsx` (Lines 23-64)

Fetches BOTH flat and grouped moments, but only displays one based on viewport:
```typescript
const flatMoments = await supabase.rpc("get_feed_moments");
const groupedMoments = await supabase.rpc("get_feed_moments_grouped");
```

**Fix:** Use responsive CSS or client-side detection to only fetch one format.

### Medium Priority Issues

| Issue | File | Impact | Fix |
|-------|------|--------|-----|
| Calendar fetches 2 lifecycles sequentially | `calendar/page.tsx:35-47` | 2 queries → 1 | Use Promise.all or combined RPC |
| Map page 3 sequential RPCs | `map/page.tsx:41-79` | 3 queries | Use Promise.all |
| Event counts aggregated client-side | `lib/cache/server-cache.ts:263-318` | Inefficient | Use GROUP BY in SQL |
| Missing cache on organizer dashboard | `organizer/page.tsx` | Recalcs on every load | Add `unstable_cache()` |

### What's Already Good

| Pattern | File | Status |
|---------|------|--------|
| Homepage parallel fetching | `page.tsx:223-227` | :white_check_mark: Uses Promise.all |
| Archive page count batching | `archive/[year]/[month]/page.tsx:155-162` | :white_check_mark: Parallel counts |
| Batch translation fetching | `lib/translations.ts` | :white_check_mark: `getEventTranslationsBatch()` |
| Event lifecycle caching | `lib/cache/server-cache.ts` | :white_check_mark: `unstable_cache()` used |

### Recommendations Summary

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| HIGH | Create moment adjacency RPC | -3 queries per moment view |
| HIGH | Create organizer stats RPC | -4 queries per dashboard load |
| HIGH | Conditional moments fetch | -1 RPC call on /moments |
| MEDIUM | Promise.all for calendar/map | -50-100ms TTFB |
| MEDIUM | Cache organizer dashboard | Faster repeat visits |

---

## Iteration 7: JavaScript & Caching Analysis

**Date:** 2026-01-24

### Dependency Analysis

| Package | Usage | Status |
|---------|-------|--------|
| `heic-convert` | Server-side HEIC→JPEG | :white_check_mark: Only loaded server-side |
| `heic2any` | Client-side HEIC→JPEG (with fallback) | :white_check_mark: Dynamically imported |
| `react-query-devtools` | Dev debugging | :white_check_mark: Excluded from production via `NODE_ENV` check |
| `recharts` | Admin analytics | :white_check_mark: Dynamically imported |
| `hls.js` | Video streaming | :white_check_mark: Dynamically imported |

### Service Worker - Already Optimized

The `public/sw.js` implements:

| Feature | Implementation |
|---------|----------------|
| Precaching | Icons, manifest for instant repeat load |
| Image caching | Cloudflare CDN images cached for LCP |
| Static asset caching | Stale-while-revalidate for `/_next/static/` |
| Cache versioning | `SW_VERSION` for proper invalidation |
| Update notification | Client notified via `postMessage` |

### PWA Manifest

Complete manifest with:
- Proper icons (192x192, 512x512 with maskable variants)
- `display: standalone` for app-like experience
- Dark theme colors matching the app

### No Changes Needed This Iteration

All major JavaScript optimizations are already in place:
- DevTools properly excluded from production
- Heavy libraries dynamically imported
- Service worker caching for repeat visits
- PWA manifest configured

---

## Iteration 8: Font Loading & Final Review

**Date:** 2026-01-24

### Font Loading - Already Optimized

The root layout uses best practices:

| Setting | Value | Impact |
|---------|-------|--------|
| `display` | `"optional"` | Renders immediately with fallback, no FOIT |
| `preload` | `true` | Font is preloaded as critical resource |
| `adjustFontFallback` | `true` | Reduced CLS with adjusted fallback metrics |
| `subsets` | `["latin"]` | Smaller font file, faster download |

Plus preconnect hint to `fonts.gstatic.com`.

### Additional Findings

- `fetchPriority="high"` used on LCP images (5 files)
- `loading="lazy"` not explicitly used (Next.js Image handles automatically)

---

## Iteration 9: Final Summary

**Date:** 2026-01-24

### Changes Implemented During This Audit

| Change | Impact |
|--------|--------|
| Created `DynamicEventMap` wrapper | ~150KB removed from non-map pages |
| Converted `SeriesBadge` to Server Component | Eliminated unnecessary hydration |
| Converted `BlogStoryCard` to Server Component | Eliminated unnecessary hydration |
| Converted `MonthNavigation` to Server Component | Eliminated unnecessary hydration |

### Already Optimized (No Changes Needed)

| Category | What Was Found |
|----------|----------------|
| **Bundle** | Recharts dynamically imported, react-markdown auto code-split |
| **Images** | AVIF/WebP, Cloudflare CDN, blur placeholders, priority hints |
| **Fonts** | `display: optional`, preload, fallback adjustment |
| **Caching** | ISR on homepage, service worker for repeat visits |
| **CLS** | `scrollbar-gutter`, `content-visibility`, font fallbacks |
| **LCP** | `fetchPriority="high"`, `requestIdleCallback` for deferred work |

### Remaining Opportunities (Not Implemented)

| Priority | Action | Impact |
|----------|--------|--------|
| **HIGH** | Create `get_event_adjacent_moments_with_wraparound()` RPC | -3 queries/moment |
| **HIGH** | Create `get_organizer_dashboard_stats()` RPC | -4 queries/dashboard |
| **HIGH** | Conditional moments fetch (flat vs grouped) | -1 RPC/page |
| **MEDIUM** | Promise.all for calendar/map pages | -50-100ms TTFB |
| **MEDIUM** | Cache organizer dashboard stats | Faster repeat visits |
| **LOW** | Extract client boundaries from EventCard/VenueCard | -10KB JS |

### PageSpeed Score Expectations

Based on the optimizations in place, the app should score well on:

| Metric | Status |
|--------|--------|
| **First Contentful Paint (FCP)** | :white_check_mark: Optimized fonts, preconnects, ISR |
| **Largest Contentful Paint (LCP)** | :white_check_mark: Priority images, CDN, blur placeholder |
| **Cumulative Layout Shift (CLS)** | :white_check_mark: Font fallbacks, `scrollbar-gutter`, `content-visibility` |
| **Total Blocking Time (TBT)** | :yellow_circle: Could improve with more server components |
| **Time to Interactive (TTI)** | :yellow_circle: 225 client components is still high |

### To Achieve 100 Mobile PageSpeed

The main blockers for a perfect 100 score would be:

1. **Reduce JavaScript** - Convert more components to Server Components
2. **Optimize database queries** - Implement the RPC functions listed above
3. **Third-party scripts** - Any external analytics/tracking would affect score

---

## Appendix: Files Modified

1. `components/map/dynamic-event-map.tsx` - **Created** (dynamic import wrapper)
2. `app/[locale]/map/page.tsx` - Uses dynamic import
3. `components/events/series-badge.tsx` - Removed `"use client"`
4. `components/blog/blog-story-card.tsx` - Removed `"use client"`
5. `components/events/month-navigation.tsx` - Removed `"use client"`, added `locale` prop
6. `app/[locale]/events/archive/[year]/[month]/page.tsx` - Passes locale to MonthNavigation
