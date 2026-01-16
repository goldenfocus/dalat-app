# Handover: Redirect Past Tab to Archive Pages

**Date:** 2026-01-15
**Status:** Ready to implement
**Estimated complexity:** Medium (touches multiple components)

---

## Why We're Doing This

### SEO Problem
- `/?tab=past` uses query parameters which search engines treat as page variants, not distinct pages
- Google/Bing may not index `?tab=past` separately from `/`
- AI systems (ChatGPT, Perplexity) scraping for GEO can't reliably extract past event data

### UX Problem
- Past tab shows only 20 events with no pagination
- Users can't browse by date ("what happened in January?")
- URL is not shareable/bookmarkable in a meaningful way

### Solution
Replace `?tab=past` with time-based archive pages that are:
- Statically generated (fast, cached)
- Permanently stable URLs
- Organized by month for better browsability

---

## Current State (After Yesterday's Work)

**Created:**
- `/events/this-month` - Current month events
- `/events/this-week` - Current week events
- `/events/2026/january` - Monthly archives
- RPC functions for time-based queries
- Month navigation component
- Translations for all 12 locales

**Still Using Query Params:**
- Home page still has `?tab=past`
- EventFeedTabs component uses URL navigation with query params
- Mobile immersive view has floating tabs with past option

---

## Implementation Plan

### Phase 1: Redirect Logic
**Goal:** When user visits `?tab=past`, redirect to `/events/this-month`

**Files to modify:**
- `app/[locale]/page.tsx` - Add redirect at top of component

```typescript
// At start of Home component, before rendering
if (activeTab === "past") {
  redirect("/events/this-month");
}
```

**Consideration:** Use `redirect()` from next/navigation for server-side redirect (better for SEO than client-side).

### Phase 2: Update Tab Navigation
**Goal:** Past tab should link to archive instead of using query param

**Files to modify:**
- `components/events/event-feed-tabs.tsx` - Change Past tab behavior
- `components/events/event-feed-immersive.tsx` - Update mobile floating tabs

**Approach:**
- Keep Upcoming and Happening as tabs (query params OK for "live" content)
- Change Past tab to be a Link to `/events/this-month` instead of `?tab=past`

### Phase 3: Remove Dead Code
**Goal:** Clean up code paths that are no longer reachable

**Files to modify:**
- `app/[locale]/page.tsx` - Remove `EventsFeed` with `lifecycle="past"`
- `app/[locale]/page.tsx` - Remove archive link (now redundant)
- Remove `parseLifecycle` handling for "past"

### Phase 4: Update Sitemap
**Goal:** Ensure sitemap doesn't reference `?tab=past`

**Files to verify:**
- `app/sitemap.ts` - Already correct (no query param pages)

### Phase 5: Mobile Immersive Experience
**Goal:** Update mobile full-screen view to handle past correctly

**Files to modify:**
- `components/events/event-feed-immersive.tsx` - Update floating tabs
- Consider: Should mobile past show recent moments carousel then link to archive?

---

## Enhancement Opportunities

### 1. Preserve Content Carousel
The Past tab currently shows `PastContentFeed` (moments carousel) before events. Consider:
- Keep carousel on home, show "View past events →" link below it
- Or move carousel to `/events/this-month` page

### 2. Smart Redirect Target
Instead of always redirecting to `/events/this-month`, could redirect to:
- Most recent month with events (if this month is empty)
- `/events/this-week` if there are events this week

### 3. Canonical Tags
Add canonical tags to prevent any remaining query param issues:
```typescript
// In page metadata
alternates: {
  canonical: `/${locale}`, // Home page canonical is without params
}
```

### 4. 301 Redirect for SEO
Use permanent redirect (301) instead of temporary (307) to transfer SEO juice:
```typescript
import { permanentRedirect } from 'next/navigation';
permanentRedirect("/events/this-month");
```

### 5. Middleware Approach
Could handle redirect in middleware for better performance:
```typescript
// middleware.ts
if (url.searchParams.get('tab') === 'past') {
  return NextResponse.redirect(new URL('/events/this-month', url));
}
```

---

## Testing Checklist

- [ ] Visit `/?tab=past` → redirects to `/events/this-month`
- [ ] Visit `/fr?tab=past` → redirects to `/fr/events/this-month` (locale preserved)
- [ ] Home page tabs show Upcoming + Happening only (or Past links to archive)
- [ ] Mobile immersive view handles past correctly
- [ ] Past content carousel still accessible somewhere
- [ ] Month navigation works (prev/next)
- [ ] No console errors
- [ ] Sitemap is correct
- [ ] Check with Lighthouse for SEO score

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking bookmarks to `?tab=past` | 301 redirect preserves access |
| Users confused by change | Past content still accessible via archive |
| Mobile UX disruption | Test thoroughly on mobile devices |
| SEO impact during transition | Use permanent redirect for link equity |

---

## Execution Instructions

When ready to implement, use this prompt:

```
Implement the past tab redirect as documented in .claude/handover/2026-01-15-past-tab-redirect.md

Use these approaches:
1. /feature-dev for guided implementation with code-explorer and code-architect agents
2. /ralph-loop for iterative verification until all tests pass
3. After implementation, use /review-pr to verify code quality

Key requirements:
- Permanent redirect (301) for SEO
- Preserve locale in redirect
- Update both desktop and mobile tab navigation
- Keep the past content carousel accessible
- Clean up dead code paths
```

---

## Sub-Agent Strategy

### Recommended Agent Usage:

1. **code-explorer** - First, trace how `?tab=past` flows through:
   - `page.tsx` → `parseLifecycle()` → `EventsFeed` → `EventFeedTabs`
   - Map all touch points before changing

2. **code-architect** - Design the redirect approach:
   - Server redirect vs middleware vs client
   - How to handle locale preservation
   - Mobile immersive view strategy

3. **code-reviewer** - After implementation:
   - Check for dead code
   - Verify no regressions
   - SEO best practices

4. **ralph-loop** - Iterative testing:
   - Visit each URL combination
   - Verify redirects work
   - Check mobile/desktop

---

## Success Criteria

1. **SEO:** No pages with `?tab=past` in sitemap or indexed
2. **UX:** Users can still browse past events (via archive)
3. **Performance:** Redirect happens server-side (no flash)
4. **Code Quality:** No dead code, clean implementation
5. **Mobile:** Works correctly on immersive view

---

## Related Files Quick Reference

```
app/[locale]/page.tsx                    # Main home page with tabs
components/events/event-feed-tabs.tsx    # Tab navigation component
components/events/event-feed-immersive.tsx # Mobile full-screen view
app/[locale]/events/this-month/page.tsx  # Redirect target
lib/i18n/routing.ts                      # For redirect() import
middleware.ts                            # Alternative redirect location
```
