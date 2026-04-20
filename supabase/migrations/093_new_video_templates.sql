-- Add 3 new video templates
INSERT INTO video_templates (composition_id, name, description, aspect_ratio, duration_seconds, is_active, sort_order)
VALUES
  (
    'VehicleBrightShowcase',
    'Bright Showcase',
    'Clean white design with vivid, high-saturation photos and blue accents. Great for modern dealerships.',
    '16:9',
    35,
    true,
    4
  ),
  (
    'VehicleSplitGallery',
    'Split Gallery',
    'Shows 3 photos simultaneously in a split-panel layout. Maximizes photo impact with specs overlay.',
    '16:9',
    40,
    true,
    5
  ),
  (
    'VehicleReelsFast',
    'Fast Reels (9:16)',
    'Vertical portrait format with fast 2.5s photo cuts and bold captions. Built for TikTok and Instagram Reels.',
    '9:16',
    25,
    true,
    6
  )
ON CONFLICT (composition_id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order  = EXCLUDED.sort_order,
      is_active   = EXCLUDED.is_active;
