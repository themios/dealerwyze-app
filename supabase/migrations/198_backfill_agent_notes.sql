-- Migration 198: Backfill agent_notes from existing listing notes
-- Only applies to RE listings (make = 'RE') that have notes but no agent_notes yet.
-- Wraps each paragraph (double-newline split) in <p> tags for HTML rendering.
UPDATE vehicles
SET agent_notes = (
  SELECT string_agg('<p>' || trim(part) || '</p>', E'\n')
  FROM unnest(string_to_array(trim(notes), E'\n\n')) AS part
  WHERE trim(part) <> ''
)
WHERE make = 'RE'
  AND notes IS NOT NULL
  AND trim(notes) <> ''
  AND agent_notes IS NULL;
