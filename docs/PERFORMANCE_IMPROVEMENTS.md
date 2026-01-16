# Performance Improvements - dalat.app

This document tracks performance optimizations made to the codebase.

## Summary

| Optimization | Impact | Status |
|--------------|--------|--------|
| Redirect loop fix | Eliminates infinite redirects | ✅ Complete |
| Web Vitals monitoring | Enables measurement | ✅ Complete |
| RSVP query consolidation | 3 queries → 1 | ✅ Complete |
| Double image removal | ~50% bandwidth savings on images | ✅ Complete |
| Recharts code-splitting | ~200KB off initial bundle | ✅ Complete |
| Middleware regex pre-compilation | Minor CPU savings | ✅ Complete |
| LCP image prioritization | Faster image discovery | ✅ Complete |

---

## Lighthouse Baseline (Jan 16, 2026)

| Metric | Score | Status |
|--------|-------|--------|
| Performance | 73% | Needs improvement |
| Accessibility | 91% | Good |
| SEO | 100% | Excellent |
| Best Practices | 100% | Excellent |
| LCP | 7.8s | 🔴 Over 2.5s target |
| FCP | 1.5s | ✅ Good |
| TBT | 30ms | ✅ Good |
| CLS | 0.00 | ✅ Excellent |

---

## Completed Optimizations

### 1. Redirect Loop Fix (`lib/supabase/proxy.ts`)

**Problem:** Potential redirect loop between `/en/` (trailing slash) and `/en` (no trailing slash) due to mismatch between custom middleware and Next.js default `trailingSlash: false` setting.

**Solution:**
- Normalize pathname by removing trailing slash before processing
- Ensure redirect URLs don't include trailing slash for root locale paths
- Pre-compile regex patterns at module level (avoids per-request RegExp creation)

**Files modified:**
- `lib/supabase/proxy.ts`

---

### 2. Web Vitals Performance Monitoring

**Problem:** No visibility into real-user performance metrics.

**Solution:**
- Added `web-vitals` package
- Created `lib/performance/web-vitals.ts` for metric tracking
- Created `components/performance-monitor.tsx` client component
- Integrated into `app/[locale]/layout.tsx`

**Metrics tracked:**
- LCP (Largest Contentful Paint)
- FID/INP (First Input Delay / Interaction to Next Paint)
- CLS (Cumulative Layout Shift)
- FCP (First Contentful Paint)
- TTFB (Time to First Byte)

**Files created:**
- `lib/performance/web-vitals.ts`
- `components/performance-monitor.tsx`

**Files modified:**
- `app/[locale]/layout.tsx`

---

### 3. RSVP Query Consolidation (`events/[slug]/page.tsx`)

**Problem:** Event detail page made 3 separate queries to `rsvps` table:
- `getAttendees()` - status = 'going'
- `getWaitlist()` - status = 'waitlist'
- `getInterestedUsers()` - status = 'interested'

**Solution:**
Created `getAllRsvps()` function that fetches all RSVPs in a single query and filters in JavaScript.

**Impact:** 14 parallel queries → 12 parallel queries (14% reduction in DB round-trips)

**Files modified:**
- `app/[locale]/events/[slug]/page.tsx`

---

### 4. Double Image Loading Fix (`components/events/immersive-image.tsx`)

**Problem:** Component loaded the same image twice:
1. Main display image
2. Duplicate image with CSS blur for background effect

For a 1-2MB image, this doubled bandwidth usage.

**Solution:**
Replaced blurred background image with CSS gradient overlay:
```tsx
// Before: Loaded image twice
<img src={src} className="blur-2xl opacity-50" />

// After: CSS gradient (zero bandwidth)
<div className="bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
```

**Impact:** ~50% bandwidth reduction per image-heavy page

**Files modified:**
- `components/events/immersive-image.tsx`

---

### 5. Recharts Code-Splitting (`components/admin/analytics/`)

**Problem:** Recharts library (~200KB) was bundled with the main JavaScript, even though it's only used on the admin dashboard (behind authentication).

**Solution:**
- Created dynamic import wrappers with `next/dynamic`
- Added loading skeleton components
- Set `ssr: false` to avoid server-side rendering overhead

**Files created:**
- `components/admin/analytics/dynamic-charts.tsx`

**Files modified:**
- `components/admin/analytics/index.ts`

**Impact:** ~200KB removed from initial page loads

---

### 6. LCP Image Prioritization (`components/events/immersive-image.tsx`)

**Problem:** First event card image had 1.6s resource load delay because browser didn't know to prioritize it.

**Solution:**
- Added `priority` prop to `ImmersiveImage` component
- Set `fetchpriority="high"` and `loading="eager"` for priority images
- Pass `priority={index === 0}` to first card in feed

**Lighthouse verification:**
```
fetchpriority=high applied: ✅
Request is discoverable: ✅
lazy load not applied: ✅
```

**Files modified:**
- `components/events/immersive-image.tsx`
- `components/events/event-card-immersive.tsx`
- `components/events/event-feed-immersive.tsx`

---

## Remaining Opportunities

### HIGH Priority
- [ ] Add Lighthouse CI to GitHub Actions
- [ ] Implement virtual scrolling for moments feed
- [ ] Further query optimization with database-level RPC functions

### MEDIUM Priority
- [ ] Video autoplay optimization (add viewport detection)
- [ ] Convert more components to Server Components
- [ ] Add debouncing to slug validation input

### LOW Priority
- [ ] Service worker optimization
- [ ] Translation API batching

---

## Measurement

### Before Optimizations
Run Lighthouse to establish baseline:
```bash
npx lighthouse https://dalat.app --output=json --output-path=./performance-baseline.json
```

### After Optimizations
Compare results:
```bash
npx lighthouse https://dalat.app --output=json --output-path=./performance-after.json
```

### Local Development
Web Vitals are logged to console in development mode. Open DevTools and navigate the app to see metrics.

---

## Future AI Guidelines

When working on performance in this codebase:

1. **Measure first** - Run Lighthouse before making changes
2. **Check this document** - Avoid re-implementing completed optimizations
3. **Update this document** - Add entries for new optimizations
4. **Verify builds** - Run `bun run build` after changes
5. **Test functionality** - Ensure optimizations don't break features
