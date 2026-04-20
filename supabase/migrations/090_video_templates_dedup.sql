-- Remove duplicate video_templates rows (keep one per composition_id by ctid)
DELETE FROM video_templates
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM video_templates
  GROUP BY composition_id
);

-- Add unique constraint so ON CONFLICT DO NOTHING works in future
ALTER TABLE video_templates
  ADD CONSTRAINT video_templates_composition_id_unique UNIQUE (composition_id);
