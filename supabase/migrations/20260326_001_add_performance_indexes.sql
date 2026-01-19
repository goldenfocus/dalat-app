-- ============================================
-- Performance Indexes Migration
-- ============================================
-- Adds critical indexes for query optimization
-- Targeted at the most frequent queries identified
-- in the content distribution optimization project.
-- ============================================

-- Translation batch lookup (CRITICAL)
-- Used by translation batch fetching which runs on every page load
-- Composite index covers: content_type, target_locale, content_id
CREATE INDEX IF NOT EXISTS idx_translations_batch_lookup
ON content_translations (content_type, target_locale, content_id);

-- Full composite index for single translation lookups
-- Covers all filter columns in translation queries
CREATE INDEX IF NOT EXISTS idx_translations_composite
ON content_translations (content_type, content_id, target_locale, field_name);

-- Moments feed optimization
-- Partial index only for published moments (the only ones displayed)
-- Sorted by created_at DESC for feed pagination
CREATE INDEX IF NOT EXISTS idx_moments_feed
ON moments (status, created_at DESC)
WHERE status = 'published';

-- Event moments by event
-- For fetching moments on event detail pages
CREATE INDEX IF NOT EXISTS idx_moments_by_event
ON moments (event_id, status, created_at DESC)
WHERE status = 'published';

-- User moments timeline
-- For profile page moments section
CREATE INDEX IF NOT EXISTS idx_moments_user_timeline
ON moments (user_id, status, created_at DESC)
WHERE status = 'published';

-- Event lifecycle queries
-- Covers the common filters: status, starts_at, ends_at
-- Partial index only for published events
CREATE INDEX IF NOT EXISTS idx_events_lifecycle
ON events (status, starts_at, ends_at)
WHERE status = 'published';

-- RSVP counts optimization
-- Used frequently for event cards and detail pages
CREATE INDEX IF NOT EXISTS idx_rsvps_event_status_counts
ON rsvps (event_id, status);

-- Blog posts by status and category
-- For blog listing pages with category filters
CREATE INDEX IF NOT EXISTS idx_blog_posts_listing
ON blog_posts (status, category_id, created_at DESC)
WHERE status = 'published';

-- ============================================
-- Analyze tables after index creation
-- ============================================
-- Run ANALYZE to update statistics for the query planner

ANALYZE content_translations;
ANALYZE moments;
ANALYZE events;
ANALYZE rsvps;
ANALYZE blog_posts;
