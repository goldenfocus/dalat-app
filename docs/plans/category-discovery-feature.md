# Category Discovery Feature Plan

## Vision

Transform event categories from visual noise into a powerful discovery mechanism. Categories should help users explore, not clutter the browsing experience.

---

## Why We're Doing This

### The Problem
Event cards currently show category pills (Tour, Outdoor, Community) that:
- Compete visually with the title and key info
- Don't provide actionable value on the card itself
- Create visual inconsistency with varying colors and lengths
- Waste precious card real estate

### The Insight
Categories serve **discovery**, not **identification**. When scanning a list, users care about:
1. **What** - title
2. **When** - date/time
3. **Where** - location
4. **Who** - social proof (attendees)

Categories become valuable when users want to **explore**: "Show me all yoga events" or "What outdoor activities are happening this week?"

### The Solution
Move categories from passive display to active navigation:
- **Cards**: Clean, no tags
- **Event detail page**: Clickable tag chips that invite exploration
- **Tag pages**: Curated landing pages for each category

---

## User Flow

```
[Home] → [Event Card] → [Event Detail] → [Click "Outdoor" tag] → [Outdoor Events Page]
                                                                         ↓
                                                              [Click another event]
                                                                         ↓
                                                              [Event Detail] → ...
```

This creates a browsing loop that keeps users engaged and discovering new events.

---

## Implementation Plan

### Phase 1: Clean Up Cards
- [ ] Remove `IconTagList` from `EventCard` component
- [ ] Verify cards render cleanly without tags

### Phase 2: Event Detail Page Tags
- [ ] Find and analyze current event detail page structure
- [ ] Add clickable tag section below event description
- [ ] Style as subtle chips with icons (ghost style, not filled pills)
- [ ] Link each tag to `/events/tags/[tag]`

### Phase 3: Tag Landing Pages
- [ ] Create `/app/[locale]/events/tags/[tag]/page.tsx`
- [ ] Design hero section with:
  - Large tag icon
  - Tag name as heading
  - Brief description (e.g., "Get outside and explore Da Lat's natural beauty")
- [ ] Query events filtered by `ai_tags` containing the tag
- [ ] Reuse existing `EventCard` grid layout
- [ ] Add "Back to all events" navigation

### Phase 4: Tag Descriptions
- [ ] Add `description` field to `TAG_CONFIG` in `event-tags.ts`
- [ ] Write compelling copy for each tag category
- [ ] Support i18n for descriptions

### Phase 5: Polish & Edge Cases
- [ ] Handle invalid/unknown tags with 404 or redirect
- [ ] Add meta tags for SEO on tag pages
- [ ] Consider "Related tags" section on tag pages
- [ ] Test with real data across all tag types

---

## Technical Details

### Files to Modify
- `components/events/event-card.tsx` - Remove tag display
- `app/[locale]/events/[slug]/page.tsx` - Add clickable tags (find exact location)
- `lib/constants/event-tags.ts` - Add descriptions

### Files to Create
- `app/[locale]/events/tags/[tag]/page.tsx` - Tag landing page
- `components/events/clickable-tag-list.tsx` - Reusable clickable tags component

### Database Query
```sql
SELECT * FROM events
WHERE ai_tags @> ARRAY['outdoor']::text[]
AND starts_at > NOW()
ORDER BY starts_at ASC;
```

### URL Structure
- `/events/tags/outdoor` - Outdoor events
- `/events/tags/yoga` - Yoga events
- `/events/tags/free` - Free events

---

## Design Specifications

### Tag Chips on Detail Page
- Ghost style: transparent background, subtle border
- Icon + label
- Hover: slight background fill
- Active: scale down slightly
- Size: touch-friendly (min 44px tap target)

### Tag Landing Page Hero
```
┌─────────────────────────────────────────┐
│  [Sun Icon - Large]                     │
│                                         │
│  Outdoor Events                         │
│  Get outside and explore Da Lat's       │
│  natural beauty with hikes, tours,      │
│  and open-air activities.               │
│                                         │
│  [Back to all events]                   │
└─────────────────────────────────────────┘
```

---

## Success Metrics
- Increased event detail page → tag page navigation
- Longer session duration (browsing loop)
- More events discovered per session

---

# AI Prompt for Fresh Context

Use this prompt to continue implementation with a fresh context window:

---

## Prompt

```
I'm building a category discovery feature for dalat.app, an event discovery app for Da Lat, Vietnam.

## Current State
- Event cards show icon-based category tags (tour, outdoor, community, etc.)
- Tags are defined in `lib/constants/event-tags.ts` with icons and colors
- `IconTagList` component in `components/events/tag-badge.tsx` renders them

## Goal
Transform categories from visual noise into a discovery mechanism:

1. **Remove tags from event cards** - cards should be clean
2. **Add clickable tags to event detail page** - users can explore categories
3. **Create tag landing pages** at `/events/tags/[tag]` - shows all events with that tag

## Design Decisions Made
- No image overlays for tags
- Single tag filtering only (no multi-select)
- Tag pages show a hero with icon + description + event grid
- Ghost-style clickable chips on detail page (not filled pills)

## Your Tasks
1. Use the Explore agent to understand the event detail page structure
2. Use the code-architect agent to design the tag page
3. Remove IconTagList from EventCard
4. Add clickable tags to event detail page
5. Create the tag landing page with hero and filtered events
6. Add descriptions to TAG_CONFIG for hero copy

## Key Files
- `components/events/event-card.tsx` - remove tags
- `components/events/tag-badge.tsx` - has IconTagList and TagBadge
- `lib/constants/event-tags.ts` - tag definitions
- `app/[locale]/events/[slug]/page.tsx` - event detail (find this)

## Instructions
- Use Ralph loop (`/ralph-loop`) for iterative refinement
- Use the frontend-design skill for the tag landing page
- Use feature-dev agents for architecture decisions
- Keep the app's dark theme and minimal aesthetic
- Follow CLAUDE.md guidelines (mobile-first, 44px touch targets, etc.)

## Quality Bar
This should feel like a premium app. The tag pages should be beautiful and invite exploration. The clickable tags should feel native and responsive.
```

---

# Agent & Tool Strategy

## Recommended Approach

### 1. Start Ralph Loop
```
/ralph-loop
```
Use iterative refinement to build each component, getting feedback at each step.

### 2. Explore Codebase
Use the **Explore agent** to understand:
- Event detail page location and structure
- How events are queried and displayed
- Existing patterns for filtered list pages

### 3. Architecture Design
Use **feature-dev:code-architect** agent to:
- Design the tag page component structure
- Plan the data flow for filtered queries
- Identify reusable components

### 4. Frontend Design
Use **/frontend-design** skill for:
- Tag landing page hero design
- Clickable tag chip styling
- Responsive layout for tag page

### 5. Code Review
Use **pr-review-toolkit:code-reviewer** agent to:
- Review implementation before pushing
- Check for accessibility issues
- Verify mobile touch targets

### 6. Testing
- Test all 36 tag types render correctly
- Test empty state (tag with no events)
- Test invalid tag slugs
- Test i18n for tag labels

---

## MCP Servers (if available)

If you have MCP servers configured:
- **Supabase MCP**: Direct database queries for testing tag filters
- **Browser MCP**: Visual testing of tag pages
- **GitHub MCP**: PR creation and review

---

## Final Checklist

Before marking complete:
- [ ] Cards render without any tags
- [ ] Event detail shows clickable tags
- [ ] Tag pages load with hero + filtered events
- [ ] All 36 tags have descriptions
- [ ] Mobile touch targets are 44px+
- [ ] Dark mode looks good
- [ ] No TypeScript errors
- [ ] Passes lint
- [ ] Translations work (tag labels)
