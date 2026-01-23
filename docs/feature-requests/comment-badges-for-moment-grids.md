# Feature Request: Comment Count Badges on Moment Grid Views

## Implementation Status

**Status: IMPLEMENTED** (January 2026)

### Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260415_001_batch_comment_counts.sql` | Created | Optimized RPC for single-query batch counts |
| `lib/comments.ts` | Modified | Replaced N+1 batch function with optimized version |
| `app/api/comments/count/route.ts` | Modified | Added POST handler for batch requests |
| `lib/hooks/use-comment-counts.ts` | Created | React Query hook with caching and stability |
| `components/moments/moment-card.tsx` | Modified | Added `commentCount` prop and accessible badge |
| `components/moments/infinite-moment-grid.tsx` | Modified | Integrated hook, passes counts to cards |
| `components/moments/user-moments-timeline.tsx` | Modified | Integrated hook, passes counts to groups |
| `components/moments/profile-event-moments-group.tsx` | Modified | Added `commentCounts` prop |
| `components/home/moments-spotlight.tsx` | Modified | Integrated hook, passes counts to cards |
| `components/moments/infinite-moment-discovery-grouped.tsx` | Modified | Integrated hook, passes counts to groups |
| `components/moments/discovery-event-moments-group.tsx` | Modified | Added badge to internal card, accepts `commentCounts` |

### Improvements Over Original Plan

1. **Database optimization**: Created `get_comment_counts_batch` RPC that fetches all counts in a single query (O(1) vs O(N) round-trips)
2. **React Query integration**: Used existing React Query patterns for caching, deduplication, and stale-while-revalidate
3. **Stable key generation**: Sorted IDs prevent unnecessary refetches when array order changes
4. **Accessibility**: Added `aria-label` and `role="status"` to badges

### To Deploy

1. Apply migration: `supabase db push` or via Supabase dashboard
2. Deploy code changes
3. Test all grid views listed in verification checklist below

---

## Context

dalat.app is an event discovery platform for Đà Lạt, Vietnam. Users can share "moments" (photos/videos) from events. A threaded comments system was recently added with full Slack-style threading support.

**Current state:**
- ✅ Comments work on moment detail pages (`/moments/[id]`) via `CommentsSection`
- ✅ Comments work on mobile feed (TikTok-style) via `CommentsButton` → `CommentsSheet`
- ❌ Grid views (event moments, profiles, discovery) show NO indication of comments

**Goal:** Add small comment count badges to moment thumbnails in grid views so users can see which moments have active discussions.

---

## Implementation Instructions

### Step 1: Explore the Existing Architecture

Before writing any code, use the **Explore agent** to understand:

```
Search for these files and understand their data flow:
1. components/moments/moment-card.tsx - The card component to modify
2. components/comments/index.ts - All exported comment components
3. lib/comments.ts - Server-side comment functions (has getCommentCount)
4. app/api/comments/count/route.ts - Existing API for single count
5. components/moments/infinite-moment-grid.tsx - Example consumer
```

### Step 2: Extend the Existing API (Don't Create New Endpoints)

The existing `/api/comments/count` endpoint returns counts for a single target. Extend it to support batch requests:

**Current signature:**
```
GET /api/comments/count?targetType=moment&targetId=xyz
Returns: { total_count: number, top_level_count: number }
```

**Extended signature (backwards compatible):**
```
GET /api/comments/count?targetType=moment&targetId=xyz  // single (existing)
POST /api/comments/count  // batch (new)
Body: { targets: [{ targetType: "moment", targetId: "abc" }, ...] }
Returns: { counts: { "abc": 5, "def": 0, ... } }
```

Reuse the existing `getCommentCount()` function from `lib/comments.ts` in a loop, or create a batch variant that does a single Supabase query with `IN` clause.

### Step 3: Modify MomentCard Component

**File:** `components/moments/moment-card.tsx`

Add optional `commentCount` prop and render a badge:

```tsx
interface MomentCardProps {
  moment: MomentForCard;
  from?: "moments" | "event" | "profile" | "discovery";
  commentCount?: number;  // NEW
}

// Inside the component, add this badge overlay (position: bottom-right)
{commentCount != null && commentCount > 0 && (
  <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs pointer-events-none">
    <MessageCircle className="w-3 h-3" />
    <span>{commentCount}</span>
  </div>
)}
```

Import `MessageCircle` from `lucide-react`.

### Step 4: Create a React Hook for Batch Fetching

**File:** `lib/hooks/use-comment-counts.ts` (new file)

```tsx
"use client";

import { useState, useEffect } from "react";

export function useCommentCounts(momentIds: string[]) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (momentIds.length === 0) return;

    setLoading(true);
    fetch("/api/comments/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: momentIds.map(id => ({ targetType: "moment", targetId: id }))
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.counts) {
          setCounts(new Map(Object.entries(data.counts)));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [momentIds.join(",")]); // Re-fetch when IDs change

  return { counts, loading };
}
```

### Step 5: Integrate in Grid Components

Update these components to use the hook and pass counts to `MomentCard`:

1. **`components/moments/infinite-moment-grid.tsx`** - Event moments page
2. **`components/moments/user-moments-timeline.tsx`** - Profile page
3. **`components/home/moments-spotlight.tsx`** - Home carousel
4. **`components/moments/infinite-moment-discovery-grouped.tsx`** - Desktop discovery

Pattern for each:
```tsx
// Get moment IDs from the data
const momentIds = moments.map(m => m.id);

// Fetch counts
const { counts } = useCommentCounts(momentIds);

// Pass to card
<MomentCard
  moment={moment}
  from="event"
  commentCount={counts.get(moment.id)}
/>
```

---

## Critical Requirements

### DO Reuse
- `lib/comments.ts` - Existing server functions
- `/api/comments/count/route.ts` - Extend, don't duplicate
- `MomentCard` - Modify, don't create new card component
- `MessageCircle` icon from lucide-react (already used elsewhere)

### DON'T Create
- New API endpoints when extending existing ones works
- New card components when MomentCard can be extended
- New comment fetching logic when lib/comments.ts has it

### Style Guidelines (from CLAUDE.md)
- Mobile-first: 44x44px touch targets minimum
- Use `active:scale-95` for touch feedback
- Backdrop blur for overlays: `bg-black/60 backdrop-blur-sm`
- Always test on actual mobile devices

---

## Verification Checklist

After implementation, verify:

- [ ] `/events/[slug]/moments` - Grid shows badges on moments with comments
- [ ] Profile page (`/[username]`) - User's moments show badges
- [ ] `/moments` (desktop) - Discovery grid shows badges
- [ ] Home page carousel - Spotlight moments show badges
- [ ] Badge only appears when count > 0 (no "0" badges)
- [ ] Clicking badged moment → detail page shows matching comment count
- [ ] Mobile: Badge is readable and doesn't interfere with tap target
- [ ] No console errors about missing props or failed fetches

---

## Agent Usage Recommendations

When implementing this feature, use these agents:

1. **Explore agent** - First, to understand the existing comment system architecture
2. **Plan agent** - To design the batch API extension
3. **code-reviewer agent** - After implementation, to check for issues
4. **silent-failure-hunter agent** - To verify error handling in the new API
5. **pr-test-analyzer agent** - Before PR, to check test coverage

---

## Files Reference

```
Key files to read:
├── components/comments/
│   ├── index.ts              # All exports
│   ├── comments-button.tsx   # Engagement button (reuse pattern)
│   └── comments-section.tsx  # Inline comments (detail page)
├── components/moments/
│   ├── moment-card.tsx       # MODIFY THIS
│   ├── infinite-moment-grid.tsx
│   └── user-moments-timeline.tsx
├── lib/
│   ├── comments.ts           # Server functions - REUSE
│   └── types/index.ts        # CommentTargetType type
└── app/api/comments/
    └── count/route.ts        # EXTEND THIS
```

---

## Example Final Result

A moment thumbnail in any grid view should look like:

```
┌─────────────────┐
│                 │
│   [photo/video] │
│                 │
│           💬 5  │  ← Badge (bottom-right)
└─────────────────┘
```

Badge only visible when comments exist. Clean, minimal, Instagram-like.
