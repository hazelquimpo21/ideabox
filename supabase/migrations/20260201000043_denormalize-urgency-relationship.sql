-- Migration 043: Denormalize urgency_score and relationship_signal to emails table
-- These fields exist in email_analyses JSONB but are needed for fast list-view access.
-- See: .plan.md section 1.1, docs/UI_FIELD_AUDIT.md recommendations C and D.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS urgency_score INTEGER;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS relationship_signal TEXT;

-- Add check constraint for relationship_signal valid values (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'emails_relationship_signal_check'
      AND conrelid = 'emails'::regclass
  ) THEN
    ALTER TABLE emails ADD CONSTRAINT emails_relationship_signal_check
      CHECK (relationship_signal IS NULL OR relationship_signal IN ('positive', 'neutral', 'negative', 'unknown'));
  END IF;
END $$;

-- Backfill from email_analyses JSONB (action_extraction.urgencyScore and client_tagging.relationship_signal)
UPDATE emails e
SET
  urgency_score = COALESCE(
    (ea.action_extraction->>'urgencyScore')::INTEGER,
    NULL
  ),
  relationship_signal = COALESCE(
    ea.client_tagging->>'relationship_signal',
    NULL
  )
FROM email_analyses ea
WHERE ea.email_id = e.id
  AND (ea.action_extraction IS NOT NULL OR ea.client_tagging IS NOT NULL);

-- Index for filtering high-urgency emails
CREATE INDEX IF NOT EXISTS idx_emails_urgency_score ON emails (urgency_score) WHERE urgency_score IS NOT NULL;
