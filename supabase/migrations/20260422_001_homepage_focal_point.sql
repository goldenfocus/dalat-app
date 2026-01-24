-- Add focal point column to homepage_config for image positioning
-- Focal point is stored as "X% Y%" string (e.g., "50% 30%")

ALTER TABLE homepage_config
ADD COLUMN hero_focal_point TEXT DEFAULT '50% 50%';

-- Add comment for documentation
COMMENT ON COLUMN homepage_config.hero_focal_point IS 'Focal point for hero image positioning, stored as "X% Y%" (e.g., "50% 30%"). Defaults to center.';
