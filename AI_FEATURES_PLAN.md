# AI-Powered Features Implementation Plan

> **For:** Fresh Claude Code session with full context
> **Goal:** Implement spam detection, auto-tagging, and personalized recommendations
> **Cost estimate:** ~$5-20/month at moderate usage

---

## Overview

Three AI features to add:

1. **Spam Filter** - Auto-detect and flag service ads masquerading as events
2. **Smart Tags** - Auto-categorize events (music, yoga, food, art, etc.)
3. **For You** - Personalized event recommendations based on user history

All features use Claude API for classification/recommendations.

---

## Feature 1: Spam Detection

### Problem
Events like "Hút Hầm Cầu Tại Đà Lạt" (septic tank pumping service) pollute the feed.

### Implementation

#### 1.1 Create spam classifier
```
lib/ai/spam-classifier.ts
```

**Logic:**
- Input: event title + description
- Output: `{ isSpam: boolean, confidence: number, reason: string }`
- Spam indicators: service ads, commercial promotions, non-events

**Prompt strategy:**
```
Classify if this is a legitimate community event or spam/service ad.

Event: {title}
Description: {description}

Output JSON: { "isSpam": boolean, "confidence": 0-1, "reason": "brief explanation" }

Spam examples: plumbing services, transportation ads, commercial spam
NOT spam: concerts, workshops, meetups, festivals, classes
```

#### 1.2 Database changes
```sql
-- Add to events table
ALTER TABLE events ADD COLUMN spam_score float DEFAULT 0;
ALTER TABLE events ADD COLUMN spam_reason text;
ALTER TABLE events ADD COLUMN spam_checked_at timestamptz;
```

#### 1.3 Integration points
- **On event creation:** Run spam check, auto-hide if score > 0.8
- **Admin dashboard:** Show flagged events for review
- **API endpoint:** `POST /api/admin/spam-check` for bulk checking

#### 1.4 Files to create/modify
- `lib/ai/spam-classifier.ts` - Core classification logic
- `app/api/events/route.ts` - Add spam check on create
- `supabase/migrations/xxx_spam_detection.sql` - Schema changes
- `components/admin/spam-review.tsx` - Admin UI for reviewing flagged events

---

## Feature 2: Smart Tags (Auto-categorization)

### Problem
Events lack consistent categorization, making filtering/discovery hard.

### Implementation

#### 2.1 Define tag taxonomy
```typescript
const EVENT_TAGS = [
  // Activities
  'music', 'yoga', 'meditation', 'fitness', 'dance', 'art', 'photography',
  'cooking', 'workshop', 'class', 'tour', 'hiking', 'sports',
  // Social
  'meetup', 'networking', 'community', 'party', 'celebration',
  // Food & Drink
  'food', 'coffee', 'restaurant', 'market', 'tasting',
  // Culture
  'festival', 'concert', 'exhibition', 'performance', 'film',
  // Wellness
  'wellness', 'retreat', 'spa', 'healing',
  // Other
  'kids', 'family', 'outdoor', 'indoor', 'free', 'charity'
] as const;
```

#### 2.2 Create tagger
```
lib/ai/event-tagger.ts
```

**Logic:**
- Input: event title + description + location
- Output: `string[]` (2-5 relevant tags)

**Prompt strategy:**
```
Categorize this Đà Lạt event with 2-5 tags from this list:
{TAG_LIST}

Event: {title}
Description: {description}
Location: {location}

Output JSON array of tags, most relevant first: ["tag1", "tag2", ...]
```

#### 2.3 Database changes
```sql
-- Add tags column (using Postgres array)
ALTER TABLE events ADD COLUMN ai_tags text[] DEFAULT '{}';
ALTER TABLE events ADD COLUMN ai_tags_updated_at timestamptz;

-- Index for tag filtering
CREATE INDEX idx_events_ai_tags ON events USING GIN (ai_tags);
```

#### 2.4 UI Integration
- Show tags on EventCard
- Add tag filter chips on home page
- Filter by tag: `/events?tag=music`

#### 2.5 Files to create/modify
- `lib/ai/event-tagger.ts` - Core tagging logic
- `lib/constants/event-tags.ts` - Tag taxonomy
- `supabase/migrations/xxx_event_tags.sql` - Schema
- `components/events/event-card.tsx` - Display tags
- `components/events/tag-filter.tsx` - Filter UI
- `app/[locale]/page.tsx` - Add tag filtering

---

## Feature 3: "For You" Recommendations

### Problem
Users see all events, not personalized to their interests.

### Implementation

#### 3.1 Collect user signals
Track user behavior to build preference profile:
- RSVPs (going/interested)
- Events attended (past RSVPs)
- Event views (optional - needs analytics)
- Saved/bookmarked events

#### 3.2 Create recommender
```
lib/ai/event-recommender.ts
```

**Logic:**
- Input: user's past events + current available events
- Output: ranked list of recommended event IDs

**Prompt strategy:**
```
Based on this user's event history, rank which upcoming events they'd most enjoy.

User attended these events:
{past_events_summary}

Available upcoming events:
{upcoming_events_list}

Return JSON array of event IDs ranked by relevance: ["id1", "id2", ...]
Include brief reason for top 3 picks.
```

#### 3.3 Database changes
```sql
-- Cache recommendations (refresh daily)
CREATE TABLE user_recommendations (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  score float NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_recommendations_user ON user_recommendations(user_id);
```

#### 3.4 UI Integration
- "For You" tab on home page
- "You might like" section on event pages
- Personalized notification suggestions

#### 3.5 Files to create/modify
- `lib/ai/event-recommender.ts` - Recommendation logic
- `app/api/recommendations/route.ts` - API endpoint
- `supabase/migrations/xxx_recommendations.sql` - Schema
- `app/[locale]/page.tsx` - Add "For You" tab
- `components/events/recommendations-section.tsx` - UI component

---

## Implementation Order

### Phase 1: Smart Tags (Day 1)
Most visible impact, simplest to implement.
1. Create tag taxonomy
2. Build tagger API
3. Run on existing events (batch job)
4. Add tag display to EventCard
5. Add tag filter UI

### Phase 2: Spam Detection (Day 2)
Cleans up the feed.
1. Create spam classifier
2. Add schema changes
3. Integrate on event creation
4. Build admin review UI
5. Batch check existing events

### Phase 3: For You (Day 3)
Most complex, requires user data.
1. Add recommendations table
2. Build recommender
3. Create API endpoint
4. Add "For You" tab
5. Set up daily refresh job

---

## Recommended Approach for Agent

Use `/ralph-loop` for iterative implementation:

```
/ralph-loop

Implement AI features in this order:
1. Smart Tags - lib/ai/event-tagger.ts + UI
2. Spam Detection - lib/ai/spam-classifier.ts + admin UI
3. For You - lib/ai/event-recommender.ts + homepage tab

For each feature:
- Create the AI logic module
- Add database migrations
- Build API endpoints
- Integrate into UI
- Test with real data

Use @feature-dev:code-architect for planning each feature.
Use @pr-review-toolkit:code-reviewer before committing.
```

---

## Cost Optimization

### Caching strategy
- **Tags:** Cache in DB, only re-tag if event updated
- **Spam:** Check once on creation, cache result
- **Recommendations:** Refresh daily, not per-request

### Batch processing
- Run tagging/spam checks in background jobs
- Use Vercel cron for daily recommendation refresh

### Model selection
- Use `claude-haiku` for simple classification (spam, tags) - 10x cheaper
- Use `claude-sonnet` only for complex recommendations

---

## Existing Patterns to Follow

### AI Integration
- See `lib/search/expand-query.ts` for Claude API pattern
- See `components/ui/ai-enhance-textarea.tsx` for AI-enhanced input

### Database
- See `supabase/migrations/` for migration format
- Use RLS policies for user data

### API Routes
- See `app/api/` for route patterns
- Always add auth checks for user-specific endpoints

---

## Testing Commands

```bash
# Test spam classifier
curl -X POST http://localhost:3000/api/admin/spam-check \
  -H "Content-Type: application/json" \
  -d '{"eventId": "xxx"}'

# Test tagger
curl -X POST http://localhost:3000/api/admin/tag-event \
  -H "Content-Type: application/json" \
  -d '{"eventId": "xxx"}'

# Test recommendations
curl http://localhost:3000/api/recommendations \
  -H "Authorization: Bearer xxx"
```

---

## Success Metrics

- **Spam:** <5% spam events visible in feed
- **Tags:** 100% events tagged within 1 min of creation
- **For You:** >30% click-through on recommended events

---

## Notes

- Auto-translation already exists via Google Cloud Translation API
- Events table has `source_locale` field for detected language
- `content_translations` table stores all translations
- 12 locales supported: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id
