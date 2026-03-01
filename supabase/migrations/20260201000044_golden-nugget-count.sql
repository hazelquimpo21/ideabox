-- Migration 044: Add golden_nugget_count for list-view gem badge display
-- ContentDigest extracts up to 7 nuggets per email but list views can't show this
-- without a denormalized count (nuggets live in email_analyses JSONB).

ALTER TABLE emails ADD COLUMN IF NOT EXISTS golden_nugget_count INTEGER DEFAULT 0;

-- Backfill from email_analyses JSONB
UPDATE emails e
SET golden_nugget_count = COALESCE(
  jsonb_array_length(
    COALESCE(
      ea.content_digest->'golden_nuggets',
      ea.content_digest->'goldenNuggets',
      '[]'::jsonb
    )
  ),
  0
)
FROM email_analyses ea
WHERE ea.email_id = e.id
  AND ea.content_digest IS NOT NULL;
