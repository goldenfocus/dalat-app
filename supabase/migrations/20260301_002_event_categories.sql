-- Event categories system with many-to-many relationship
-- Migration: 20260301_002_event_categories.sql

-- Event categories table
CREATE TABLE event_categories (
  id text PRIMARY KEY, -- e.g., 'music', 'yoga', 'food'
  name_en text NOT NULL,
  name_vi text,
  icon text, -- emoji or icon name
  color text, -- hex color for UI
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Many-to-many junction table
CREATE TABLE event_category_assignments (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  category_id text REFERENCES event_categories ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

CREATE INDEX idx_event_category_assignments_event
  ON event_category_assignments(event_id);
CREATE INDEX idx_event_category_assignments_category
  ON event_category_assignments(category_id);

-- Pre-populate categories with Da Lat-relevant options
INSERT INTO event_categories (id, name_en, name_vi, icon, color, sort_order) VALUES
('music', 'Music', 'Âm nhạc', '🎵', '#8B5CF6', 1),
('yoga', 'Yoga & Wellness', 'Yoga', '🧘', '#10B981', 2),
('food', 'Food & Dining', 'Ẩm thực', '🍜', '#F59E0B', 3),
('art', 'Art & Culture', 'Nghệ thuật', '🎨', '#EC4899', 4),
('meditation', 'Meditation', 'Thiền', '🧘‍♀️', '#6366F1', 5),
('festival', 'Festivals', 'Lễ hội', '🎉', '#EF4444', 6),
('nature', 'Nature & Outdoors', 'Thiên nhiên', '🌿', '#059669', 7),
('community', 'Community', 'Cộng đồng', '👥', '#3B82F6', 8),
('education', 'Education', 'Giáo dục', '📚', '#0EA5E9', 9),
('sports', 'Sports & Fitness', 'Thể thao', '⚽', '#F97316', 10),
('nightlife', 'Nightlife', 'Đêm', '🌙', '#A855F7', 11),
('coffee', 'Coffee & Tea', 'Cà phê', '☕', '#92400E', 12);

GRANT SELECT ON event_categories TO anon, authenticated;
GRANT SELECT ON event_category_assignments TO anon, authenticated;

COMMENT ON TABLE event_categories IS 'Predefined event categories for filtering and discovery';
COMMENT ON TABLE event_category_assignments IS 'Many-to-many relationship: events can have multiple categories';
